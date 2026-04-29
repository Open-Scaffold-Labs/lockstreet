import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';

/**
 * Fetch the current user's notification inbox. Returns:
 *   notifications  - array, newest first
 *   unreadCount    - number of rows with read_at = null
 *   loading, error, reload
 *   markRead(id)   - flip read_at on a row
 *   markAllRead()  - flip read_at on every unread row
 *
 * RLS keeps this scoped to the signed-in user automatically.
 */
export function useNotifications({ limit = 50 } = {}) {
  const { userId } = useAuth?.() || {};
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);

  const load = useCallback(async () => {
    if (!supabase || !userId) {
      setNotifications([]); setLoading(false); return;
    }
    setLoading(true);
    try {
      const { data, error: e } = await supabase
        .from('notifications')
        .select('id, type, title, body, url, meta, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (e) throw e;
      setNotifications((data || []).map(mapNotification));
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [userId, limit]);

  useEffect(() => { load(); }, [load]);

  const markRead = useCallback(async (id) => {
    if (!supabase || !userId) return;
    // Optimistic: flip locally first, then persist.
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    const { error: e } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id);
    if (e) {
      // Revert on failure.
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: null } : n)));
      throw e;
    }
  }, [userId]);

  const markAllRead = useCallback(async () => {
    if (!supabase || !userId) return;
    const unreadIds = notifications.filter((n) => !n.readAt).map((n) => n.id);
    if (!unreadIds.length) return;
    const stamp = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: stamp })));
    const { error: e } = await supabase
      .from('notifications')
      .update({ read_at: stamp })
      .in('id', unreadIds);
    if (e) throw e;
  }, [notifications, userId]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.readAt).length,
    [notifications],
  );

  return { notifications, unreadCount, loading, error, reload: load, markRead, markAllRead };
}

function mapNotification(n) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    url: n.url,
    meta: n.meta || {},
    readAt: n.read_at,
    createdAt: n.created_at,
  };
}
