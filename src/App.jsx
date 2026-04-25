import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header.jsx';
import ScoresRoute from './routes/ScoresRoute.jsx';
import PicksRoute from './routes/PicksRoute.jsx';
import RecordRoute from './routes/RecordRoute.jsx';
import SubscribeRoute from './routes/SubscribeRoute.jsx';
import AdminRoute from './routes/AdminRoute.jsx';
import SuccessRoute from './routes/SuccessRoute.jsx';
import SignInRoute from './routes/SignInRoute.jsx';

export default function App() {
  return (
    <>
      <Header />
      <main className="wrap">
        <Routes>
          <Route path="/" element={<Navigate to="/scores" replace />} />
          <Route path="/scores" element={<ScoresRoute />} />
          <Route path="/picks" element={<PicksRoute />} />
          <Route path="/record" element={<RecordRoute />} />
          <Route path="/subscribe" element={<SubscribeRoute />} />
          <Route path="/admin" element={<AdminRoute />} />
          <Route path="/success" element={<SuccessRoute />} />
          <Route path="/sign-in/*" element={<SignInRoute />} />
          <Route path="*" element={<Navigate to="/scores" replace />} />
        </Routes>
      </main>
      <footer className="footnote">Lock Street — Follow the smart money.</footer>
    </>
  );
}
