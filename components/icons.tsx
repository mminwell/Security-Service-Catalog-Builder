const line = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Decorative line icons for the six CSF function cards. The card label carries the name. */
export function CsfFunctionIcon({ code }: { code: string }) {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true" className="csf-function-icon">
      {functionMark(code)}
    </svg>
  );
}

function functionMark(code: string) {
  switch (code) {
    case "GV":
      return (
        <>
          <path {...line} d="M4.5 20.5h15" />
          <path {...line} d="M6.5 20.5V9.5" />
          <path {...line} d="M12 20.5V9.5" />
          <path {...line} d="M17.5 20.5V9.5" />
          <path {...line} d="M4.5 9.5h15" />
          <path {...line} d="M4.5 9.5 12 4l7.5 5.5" />
        </>
      );
    case "ID":
      return (
        <>
          <circle {...line} cx="10.5" cy="10.5" r="5.25" />
          <path {...line} d="m14.4 14.4 5.1 5.1" />
        </>
      );
    case "PR":
      return <path {...line} d="M12 3.5 19 6.4v5.4c0 4-2.7 6.7-7 8.2-4.3-1.5-7-4.2-7-8.2V6.4L12 3.5z" />;
    case "DE":
      return (
        <>
          <circle {...line} cx="12" cy="12" r="7.5" />
          <circle {...line} cx="12" cy="12" r="3.5" />
          <circle cx="12" cy="12" r="1.1" fill="currentColor" />
          <path {...line} d="M12 12 17.2 7.4" />
        </>
      );
    case "RS":
      return <path {...line} d="M13 3.5 6.2 13H11l-1 7.5L17.8 11H13l.9-7.5z" />;
    case "RC":
      return (
        <>
          <path {...line} d="M19 12a7 7 0 1 1-2.2-5.1" />
          <path {...line} d="M19 4.5V9h-4.5" />
        </>
      );
    default:
      return null;
  }
}

export function CartIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="icon">
      <path
        d="M4 6h1.4l1.2 8.2a1.5 1.5 0 0 0 1.5 1.3h8.7a1.5 1.5 0 0 0 1.5-1.2L20 8H7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="19" r="1.3" fill="currentColor" />
      <circle cx="17" cy="19" r="1.3" fill="currentColor" />
    </svg>
  );
}
