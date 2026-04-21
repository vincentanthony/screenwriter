import { Routes, Route, Navigate } from 'react-router-dom';
import { ScriptsPage } from '@/pages/ScriptsPage';
import { EditorPage } from '@/pages/EditorPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ScriptsPage />} />
      <Route path="/scripts/:id" element={<EditorPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
