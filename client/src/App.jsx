import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth';
import { EventProvider } from './components/EventContext';
import AdminLayout from './components/AdminLayout';
import ErrorBoundary from './components/ErrorBoundary';

import Landing from './pages/Landing';
import Privacy from './pages/Privacy';
import MarshalForm from './pages/MarshalForm';
import MarshalStatus from './pages/MarshalStatus';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import AdminEvents from './pages/AdminEvents';
import AdminInvitations from './pages/AdminInvitations';
import AdminMarshals from './pages/AdminMarshals';
import AdminApplications from './pages/AdminApplications';
import AdminSchedule from './pages/AdminSchedule';
import AdminComms from './pages/AdminComms';
import AdminPayments from './pages/AdminPayments';
import AdminReports from './pages/AdminReports';
import CommitteeView from './pages/CommitteeView';

// Admin section wraps the layout in the event provider so every screen
// shares the active-event selection.
function AdminSection() {
  return (
    <EventProvider>
      <AdminLayout />
    </EventProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public landing + marshal-facing routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/apply/:token" element={<MarshalForm />} />
          <Route path="/status/:token" element={<MarshalStatus />} />

          {/* Admin */}
          <Route path="/admin/login" element={<Login />} />
          <Route path="/admin" element={<AdminSection />}>
            <Route index element={<AdminDashboard />} />
            <Route path="events" element={<AdminEvents />} />
            <Route path="invitations" element={<AdminInvitations />} />
            <Route path="marshals" element={<AdminMarshals />} />
            <Route path="applications" element={<AdminApplications />} />
            <Route path="schedule" element={<AdminSchedule />} />
            <Route path="comms" element={<AdminComms />} />
            <Route path="payments" element={<AdminPayments />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="committee" element={<CommitteeView />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ErrorBoundary>
  );
}
