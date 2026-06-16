import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../api';

const EventCtx = createContext(null);

export function EventProvider({ children }) {
  const [events, setEvents] = useState([]);
  const [activeId, setActiveId] = useState(() => {
    const v = localStorage.getItem('mp_active_event');
    return v ? Number(v) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/events')
      .then((res) => {
        setEvents(res.data);
        if (res.data.length) {
          const stored = localStorage.getItem('mp_active_event');
          const valid = stored && res.data.some((e) => e.id === Number(stored));
          if (!valid) {
            setActiveId(res.data[0].id);
            localStorage.setItem('mp_active_event', String(res.data[0].id));
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function selectEvent(id) {
    setActiveId(Number(id));
    localStorage.setItem('mp_active_event', String(id));
  }

  function refreshEvents() {
    return api.get('/admin/events').then((res) => setEvents(res.data));
  }

  const activeEvent = events.find((e) => e.id === activeId) || null;

  return (
    <EventCtx.Provider value={{ events, activeId, activeEvent, selectEvent, refreshEvents, loading }}>
      {children}
    </EventCtx.Provider>
  );
}

export function useEvents() {
  return useContext(EventCtx);
}
