import { Routes, Route, Navigate } from 'react-router-dom';
import { ScriptsPage } from '@/pages/ScriptsPage';
import { EditorPage } from '@/pages/EditorPage';
import { UsagePage } from '@/pages/UsagePage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ScriptsPage />} />
      <Route path="/scripts/:id" element={<EditorPage />} />
      {/* AI cost / call log. Accessible from the ambient indicator
          in the editor top bar and from ScriptsPage. */}
      <Route path="/usage" element={<UsagePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
