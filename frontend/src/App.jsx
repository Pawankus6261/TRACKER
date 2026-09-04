import React, { useState, useEffect } from 'react';
import { PublicTracking } from './pages/PublicTracking';
import { Dashboard } from './pages/Dashboard';
import { CreateSession } from './pages/CreateSession';

export function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  // Route 1: Shareable Track Link (/track/:token or /connect/:token)
  const trackMatch = currentPath.match(/^\/(?:track|connect)\/([^/?#]+)/);
  if (trackMatch) {
    const token = trackMatch[1];
    return <PublicTracking token={token} />;
  }

  // Route 2: Owner Dashboard (/dashboard/:ownerKey)
  const dashboardMatch = currentPath.match(/^\/dashboard\/([^/?#]+)/);
  if (dashboardMatch) {
    const ownerKey = dashboardMatch[1];
    return <Dashboard ownerKey={ownerKey} />;
  }

  // Route 3: Home / Create Session (auto-generates link immediately)
  return (
    <CreateSession
      onSessionCreated={(ownerKey) => {
        navigate(`/dashboard/${ownerKey}`);
      }}
    />
  );
}

export default App;
