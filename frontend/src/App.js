import React, { useState } from "react";
import Login from "./components/Login";
import Feed from "./components/Feed";
import Dashboard from "./components/Dashboard";
import PrepPage from "./components/PrepPage";
import HRDashboard from "./components/HRDashboard";
import Profile from "./components/Profile";
import Navbar from "./components/Navbar";
import { ToastProvider } from "./components/Toast";
import "./App.css";

export default function App() {
  const [user, setUser] = useState(null); // { id, name, email, role }
  const [page, setPage] = useState("feed"); // feed | dashboard | prep | hr | profile
  const [selectedApp, setSelectedApp] = useState(null);

  const handleLogin = (userData) => {
    setUser(userData);
    setPage(userData.role === "hr" ? "hr" : "feed");
  };

  const handleLogout = () => {
    setUser(null);
    setSelectedApp(null);
    setPage("feed");
  };

  const openPrep = (app) => {
    setSelectedApp(app);
    setPage("prep");
  };

  const goBack = () => {
    setSelectedApp(null);
    setPage("dashboard");
  };

  /* Not logged in → show login */
  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <ToastProvider>
      <div className="app">
        <Navbar page={page} setPage={setPage} user={user} onLogout={handleLogout} />
        <main className="main">
          {/* Job seeker pages */}
          {page === "feed" && user.role === "user" && <Feed userId={user.id} />}
          {page === "dashboard" && user.role === "user" && (
            <Dashboard userId={user.id} onOpenPrep={openPrep} />
          )}
          {page === "prep" && selectedApp && (
            <PrepPage app={selectedApp} userId={user.id} onBack={goBack} onGoToProfile={() => setPage("profile")} />
          )}

          {/* HR pages */}
          {page === "hr" && user.role === "hr" && <HRDashboard user={user} />}
          {page === "feed" && user.role === "hr" && <HRDashboard user={user} />}

          {/* Profile – both roles */}
          {page === "profile" && <Profile user={user} />}
        </main>
      </div>
    </ToastProvider>
  );
}
