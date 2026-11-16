/**
 * Smooth vertex normals for an indexed triangle mesh: the same algorithm, order and float32 rounding as three.js
 * BufferGeometry.computeVertexNormals (unnormalised face normals summed into each vertex, then normalised), but on
 * the typed arrays directly. three's version goes through Vector3 accessors and took over a second for the 3.3
 * million triangles of the polar patch at startup.
 */
export function vertexNormals(pos: Float32Array, idx: Uint32Array): Float32Array {
  const nor = new Float32Array(pos.length);
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3;
    const b = idx[i + 1] * 3;
    const c = idx[i + 2] * 3;
    const bx = pos[b], by = pos[b + 1], bz = pos[b + 2];
    // cb = C - B, ab = A - B, n = cb x ab
    const cbx = pos[c] - bx, cby = pos[c + 1] - by, cbz = pos[c + 2] - bz;
    const abx = pos[a] - bx, aby = pos[a + 1] - by, abz = pos[a + 2] - bz;
    const nx = cby * abz - cbz * aby;
    const ny = cbz * abx - cbx * abz;
    const nz = cbx * aby - cby * abx;
    nor[a] += nx; nor[a + 1] += ny; nor[a + 2] += nz;
    nor[b] += nx; nor[b + 1] += ny; nor[b + 2] += nz;
    nor[c] += nx; nor[c + 1] += ny; nor[c + 2] += nz;
  }
  for (let i = 0; i < nor.length; i += 3) {
    const x = nor[i], y = nor[i + 1], z = nor[i + 2];
    const s = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
    nor[i] = x * s;
    nor[i + 1] = y * s;
    nor[i + 2] = z * s;
  }
  return nor;
}
