/** The app's mark and name, as one piece. Rules for its use are in docs/brand.md. */
export function Brand({ size = 20 }: { size?: number }) {
  return (
    <span class="brand" translate={"no" as never}>
      <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" width={size} height={size} />
      Reader343
    </span>
  );
}
