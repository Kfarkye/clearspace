import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout';
import DashboardView from './views/DashboardView';
import HistoryView from './views/HistoryView';
import SettingsView from './views/SettingsView';

const App: React.FC = () => {
  return (
    <AppProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardView />} />
          <Route path="history" element={<HistoryView />} />
          <Route path="settings" element={<SettingsView />} />
        </Route>
      </Routes>
    </AppProvider>
  );
};

export default App;
