export default function ErrorAlert({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="rounded-xl border border-signal bg-white px-3 py-2 text-xs text-signal">
      {message}
    </div>
  );
}
