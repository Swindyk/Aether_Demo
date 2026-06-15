import React from 'react';
import { AnswerCard } from './components/AnswerCard';
import { Dashboard } from './components/Dashboard';
import { PlayerHome } from './components/PlayerHome';

const getWindowRole = () => new URLSearchParams(window.location.search).get('window') ?? 'control';

const App: React.FC = () => {
  const role = getWindowRole();
  document.documentElement.dataset.window = role;
  document.body.dataset.window = role;

  if (role === 'answer') return <AnswerCard />;
  if (role === 'agentops') return <Dashboard />;
  return <PlayerHome />;
};

export default App;
