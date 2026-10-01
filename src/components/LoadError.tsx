export default function LoadError({ error, retry, subject = 'this page' }: { error: string; retry: () => void; subject?: string }) {
  return <div className="save-feedback save-failed" role="alert">
    <div><strong>Could not load {subject}.</strong><p>Data is unavailable. Try loading it again.</p><details><summary>Error details</summary>{error}</details></div>
    <button type="button" className="index-secondary" onClick={retry}>Retry loading</button>
  </div>
}
