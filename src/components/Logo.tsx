/* Uses the brand files in /public/brand as-is. */
export function Logo({ variant = "default", height = 28 }: { variant?: "default" | "white"; height?: number }) {
  const src = variant === "white" ? "/brand/nkapbook-logo-white.svg" : "/brand/nkapbook-logo.svg";
  // logo aspect ratio is 894:248
  return <img src={src} alt="NkapBook" height={height} width={Math.round((height * 894) / 248)} className="logo" />;
}
