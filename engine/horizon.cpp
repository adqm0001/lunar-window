#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <stdexcept>
#include <string>
#include <vector>

#ifdef _OPENMP
#include <omp.h>
#endif

namespace {

constexpr double kR = 1737400.0;
constexpr double kPi = 3.14159265358979323846;
constexpr double kDeg = kPi / 180.0;

struct PolarDem {
    std::vector<int16_t> data;
    int size = 0;
    double scale = 0.0;
    double center = 0.0;
    double valid_radius = 0.0;
    double max_height = -1e9;

    void load(const std::string& path, int n, double scale_m) {
        std::ifstream f(path, std::ios::binary);
        if (!f) throw std::runtime_error("cannot open " + path);
        data.resize(static_cast<size_t>(n) * n);
        f.read(reinterpret_cast<char*>(data.data()), static_cast<std::streamsize>(data.size() * sizeof(int16_t)));
        if (!f) throw std::runtime_error("short read " + path);
        size = n;
        scale = scale_m;
        center = (n - 1) / 2.0;
        valid_radius = 0.98 * center * scale_m;
        for (int16_t v : data) max_height = std::max(max_height, v * 0.5);
    }

    bool height(double x, double y, double& out) const {
        if (x * x + y * y >= valid_radius * valid_radius) return false;
        const double col = center + x / scale;
        const double row = center - y / scale;
        const int c0 = static_cast<int>(std::floor(col));
        const int r0 = static_cast<int>(std::floor(row));
        if (c0 < 0 || r0 < 0 || c0 >= size - 1 || r0 >= size - 1) return false;
        const double fc = col - c0;
        const double fr = row - r0;
        const int16_t* p = data.data() + static_cast<size_t>(r0) * size + c0;
        out = 0.5 * (p[0] * (1 - fc) * (1 - fr) + p[1] * fc * (1 - fr) + p[size] * (1 - fc) * fr + p[size + 1] * fc * fr);
        return true;
    }
};

struct Terrain {
    PolarDem fine;
    PolarDem coarse;
    double max_height = 0.0;
    int pole = -1;

    bool height(double x, double y, double& out) const {
        return fine.height(x, y, out) || coarse.height(x, y, out);
    }
};

struct Point {
    double lat;
    double lon;
};

std::vector<double> ray_distances(double max_m, double first_m, double growth) {
    std::vector<double> d{first_m};
    while (d.back() < max_m) d.push_back(d.back() + std::max(first_m, d.back() * growth));
    return d;
}

void horizon_for_point(const Terrain& t, const Point& p, int n_az, double obs_h, const std::vector<double>& dist,
                       const std::vector<double>& cd, const std::vector<double>& sd, float* out) {
    const double lat = p.lat * kDeg;
    const double lon = p.lon * kDeg;
    const double up[3] = {std::cos(lat) * std::cos(lon), std::cos(lat) * std::sin(lon), std::sin(lat)};
    const double east[3] = {-std::sin(lon), std::cos(lon), 0.0};
    const double north[3] = {up[1] * east[2] - up[2] * east[1], up[2] * east[0] - up[0] * east[2], up[0] * east[1] - up[1] * east[0]};

    const double k0 = 2 * kR / (1 + t.pole * up[2]);
    double h0 = 0.0;
    t.height(k0 * up[1], -t.pole * k0 * up[0], h0);
    const double r0 = kR + h0 + obs_h;
    const double peak_r = kR + t.max_height;

    for (int a = 0; a < n_az; ++a) {
        const double az = 2 * kPi * a / n_az;
        const double ca = std::cos(az), sa = std::sin(az);
        const double dir[3] = {ca * north[0] + sa * east[0], ca * north[1] + sa * east[1], ca * north[2] + sa * east[2]};
        double best_sin = -1.0;
        for (size_t i = 0; i < dist.size(); ++i) {
            const double c = cd[i], s = sd[i];
            const double bound_num = peak_r * c - r0;
            const double bound_den = std::sqrt(peak_r * peak_r + r0 * r0 - 2 * peak_r * r0 * c);
            if (bound_num / bound_den <= best_sin) break;
            const double X = c * up[0] + s * dir[0];
            const double Y = c * up[1] + s * dir[1];
            const double Z = c * up[2] + s * dir[2];
            const double k = 2 * kR / (1 + t.pole * Z);
            double h;
            if (!t.height(k * Y, -t.pole * k * X, h)) break;
            const double r = kR + h;
            const double num = r * c - r0;
            const double den = std::sqrt(r * r + r0 * r0 - 2 * r * r0 * c);
            const double sin_el = num / den;
            if (sin_el > best_sin) best_sin = sin_el;
        }
        out[a] = static_cast<float>(std::asin(std::clamp(best_sin, -1.0, 1.0)) / kDeg);
    }
}

std::vector<Point> read_points(const std::string& path) {
    std::ifstream f(path, std::ios::binary | std::ios::ate);
    if (!f) throw std::runtime_error("cannot open " + path);
    const auto bytes = static_cast<size_t>(f.tellg());
    f.seekg(0);
    std::vector<double> raw(bytes / sizeof(double));
    f.read(reinterpret_cast<char*>(raw.data()), static_cast<std::streamsize>(bytes));
    std::vector<Point> pts(raw.size() / 2);
    for (size_t i = 0; i < pts.size(); ++i) pts[i] = {raw[2 * i], raw[2 * i + 1]};
    return pts;
}

}  // namespace

int main(int argc, char** argv) {
    if (argc < 6) {
        std::fprintf(stderr, "usage: horizon <raw_dir> <points.f64> <out.f32> <n_az> <observer_m> [max_dist_m] [south|north]\n");
        return 2;
    }
    try {
        const std::string raw = argv[1];
        const auto points = read_points(argv[2]);
        const int n_az = std::atoi(argv[4]);
        const double obs_h = std::atof(argv[5]);
        const double max_d = argc > 6 ? std::atof(argv[6]) : 250000.0;
        const std::string hemisphere = argc > 7 ? argv[7] : "south";
        if (hemisphere != "south" && hemisphere != "north")
            throw std::runtime_error("hemisphere must be south or north");

        Terrain t;
        t.pole = hemisphere == "north" ? 1 : -1;
        const std::string code = hemisphere == "north" ? "n" : "s";
        t.fine.load(raw + "/ldem_85" + code + "_40m.img", 7584, 40.0);
        t.coarse.load(raw + "/ldem_75" + code + "_240m.img", 3812, 240.0);
        t.max_height = std::max(t.fine.max_height, t.coarse.max_height);

        const auto dist = ray_distances(max_d, 20.0, 0.02);
        std::vector<double> cd(dist.size()), sd(dist.size());
        for (size_t i = 0; i < dist.size(); ++i) {
            cd[i] = std::cos(dist[i] / kR);
            sd[i] = std::sin(dist[i] / kR);
        }

        std::vector<float> out(points.size() * static_cast<size_t>(n_az));
        const auto t0 = std::chrono::steady_clock::now();
        long long done = 0;
#pragma omp parallel for schedule(dynamic, 16)
        for (long long i = 0; i < static_cast<long long>(points.size()); ++i) {
            horizon_for_point(t, points[i], n_az, obs_h, dist, cd, sd, out.data() + i * n_az);
#pragma omp atomic
            ++done;
            if (done % 5000 == 0) {
#pragma omp critical
                std::fprintf(stderr, "\r%lld / %zu", done, points.size());
            }
        }
        const double secs = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
        std::ofstream o(argv[3], std::ios::binary);
        o.write(reinterpret_cast<const char*>(out.data()), static_cast<std::streamsize>(out.size() * sizeof(float)));
        int threads = 1;
#ifdef _OPENMP
        threads = omp_get_max_threads();
#endif
        std::fprintf(stderr, "\r%zu points x %d directions in %.2f s on %d threads (%zu ray steps max)\n", points.size(), n_az, secs,
                     threads, dist.size());
    } catch (const std::exception& e) {
        std::fprintf(stderr, "error: %s\n", e.what());
        return 1;
    }
    return 0;
}
