import { Routes, Route, Navigate } from 'react-router-dom';
import Header from './components/Header.jsx';
import BottomNav from './components/BottomNav.jsx';
import InstallPrompt from './components/InstallPrompt.jsx';
import OnboardingModal from './components/OnboardingModal.jsx';
import { ToastProvider } from './lib/toast.jsx';
import ScoresRoute from './routes/ScoresRoute.jsx';
import PicksRoute from './routes/PicksRoute.jsx';
import SubscribeRoute from './routes/SubscribeRoute.jsx';
import AboutRoute from './routes/AboutRoute.jsx';
import HomeRoute from './routes/HomeRoute.jsx';
import BankrollRoute from './routes/BankrollRoute.jsx';
import ParlayRoute from './routes/ParlayRoute.jsx';
import LinesRoute from './routes/LinesRoute.jsx';
import PropsRoute from './routes/PropsRoute.jsx';
import WeeklyRoute from './routes/WeeklyRoute.jsx';
import ContestRoute from './routes/ContestRoute.jsx';
import LeaderboardRoute from './routes/LeaderboardRoute.jsx';
import AdminRoute from './routes/AdminRoute.jsx';
import SuccessRoute from './routes/SuccessRoute.jsx';
import SignInRoute from './routes/SignInRoute.jsx';

export default function App() {
  return (
    <ToastProvider>
      <Header />
      <main className="wrap">
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/scores" element={<ScoresRoute />} />
          <Route path="/picks" element={<PicksRoute />} />
          <Route path="/record" element={<Navigate to="/about" replace />} />
          <Route path="/about" element={<AboutRoute />} />
          <Route path="/bankroll" element={<BankrollRoute />} />
          <Route path="/parlay" element={<ParlayRoute />} />
          <Route path="/lines" element={<LinesRoute />} />
          <Route path="/props" element={<PropsRoute />} />
          <Route path="/weekly" element={<WeeklyRoute />} />
          <Route path="/contest" element={<ContestRoute />} />
          <Route path="/leaderboard" element={<LeaderboardRoute />} />
          <Route path="/subscribe" element={<SubscribeRoute />} />
          <Route path="/admin" element={<AdminRoute />} />
          <Route path="/success" element={<SuccessRoute />} />
          <Route path="/sign-in/*" element={<SignInRoute />} />
          <Route path="*" element={<Navigate to="/scores" replace />} />
        </Routes>
      </main>
      <footer className="footnote">Lock Street - Follow the smart money.</footer>
      <BottomNav />
      <InstallPrompt />
      <OnboardingModal />
    </ToastProvider>
  );
}
