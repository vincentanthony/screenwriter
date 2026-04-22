import { Routes, Route, Navigate } from 'react-router-dom';
import { ScriptsPage } from '@/pages/ScriptsPage';
import { EditorPage } from '@/pages/EditorPage';
import { OAuthCallbackPage } from '@/pages/OAuthCallbackPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ScriptsPage />} />
      <Route path="/scripts/:id" element={<EditorPage />} />
      {/*
        OAuth redirect landing for the OpenAI Codex auth flow.
        See src/ai/openaiCodex.ts — the redirect_uri passed to OpenAI
        must match this path byte-for-byte.
      */}
      <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
