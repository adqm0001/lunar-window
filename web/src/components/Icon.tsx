const paths = {
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 1v4M12 19v4M1 12h4M19 12h4",
  calendar: "M4 5h16v15H4V5Zm0 5h16M8 3v4M16 3v4M8 13h2M14 13h2M8 17h2",
  compare: "M3 5h18v14H3V5Zm9 0v14",
  close: "M6 6l12 12M18 6L6 18",
  play: "M8 5l11 7-11 7V5Z",
  pause: "M8 5v14M16 5v14",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  check: "m5 12 4 4L19 6",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5",
  moon: "M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z",
  link: "m10 14 4-4M8 16l-1 1a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0M16 8l1-1a3 3 0 0 1 4 4l-4 4a3 3 0 0 1-4 0",
  slope: "M4 18h16L17 6 4 18Z",
  up: "m6 14 6-6 6 6",
  down: "m6 10 6 6 6-6",
  left: "m14 6-6 6 6 6",
  right: "m10 6 6 6-6 6",
  external: "M14 4h6v6M20 4l-9 9M10 5H5v14h14v-5",
} as const;

export default function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={paths[name]} />
    </svg>
  );
}
