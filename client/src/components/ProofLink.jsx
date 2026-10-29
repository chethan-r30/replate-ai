import { useEffect, useState } from 'react';
import { readProof } from '../lib/api.js';
export default function ProofLink({ url }) {
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  if (!url.startsWith('/uploads/proof/'))
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mr-4 underline">
        Open externally hosted proof
      </a>
    );
  async function open() {
    setBusy(true);
    setError('');
    try {
      setPreview(URL.createObjectURL(await readProof(url)));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="my-3">
      <button
        type="button"
        className="underline"
        disabled={busy}
        onClick={open}
      >
        {busy ? 'Opening proof...' : 'View private proof'}
      </button>
      {preview && (
        <div>
          <img
            className="mt-3 max-h-96 max-w-full rounded"
            src={preview}
            alt="Uploaded organization verification proof"
          />
          <button
            type="button"
            onClick={() => setPreview('')}
            className="mt-2 underline"
          >
            Close proof
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
