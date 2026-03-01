import { useState } from 'react';
import Auth from './components/Auth';
import Chat from './components/Chat';
import YouTubeDownload from './components/YouTubeDownload';
import './App.css';

function App() {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('chatapp_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [activeTab, setActiveTab] = useState('chat');

  const handleLogin = (userObj) => {
    localStorage.setItem('chatapp_user', JSON.stringify(userObj));
    setUser(userObj);
  };

  const handleLogout = () => {
    localStorage.removeItem('chatapp_user');
    localStorage.removeItem('youtube_channel_json');
    setUser(null);
  };

  if (!user) {
    return <Auth onLogin={handleLogin} />;
  }

  return (
    <div className="app-root">
      <div className="app-tab-bar">
        <button
          className={`app-tab${activeTab === 'chat' ? ' active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          💬 Chat
        </button>
        <button
          className={`app-tab${activeTab === 'youtube' ? ' active' : ''}`}
          onClick={() => setActiveTab('youtube')}
        >
          📺 YouTube Channel Download
        </button>
      </div>
      {activeTab === 'chat' ? (
        <Chat
          username={user.username}
          firstName={user.firstName}
          lastName={user.lastName}
          onLogout={handleLogout}
        />
      ) : (
        <YouTubeDownload
          username={user.username}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}

export default App;
