import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="card card-pad offline-card">
      <p className="eyebrow">You are offline</p>
      <h1>Your downloaded Bible is still here</h1>
      <p className="muted">
        HolyWord could not reach the network. Reading, local search, highlights, bookmarks, notes
        and cached reading plans continue to work. Changes will sync when you reconnect.
      </p>
      <div className="row" style={{ justifyContent: "center" }}>
        <Link className="button" href="/read">
          Open the reader
        </Link>
        <Link className="button button-secondary" href="/study">
          Open study
        </Link>
      </div>
    </div>
  );
}
