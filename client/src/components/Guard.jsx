// Client guards improve navigation; server middleware still enforces access.
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../stores/auth.js';
export default function Guard({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading)
    return (
      <p role="status" className="py-12">
        Checking your session...
      </p>
    );
  if (!user)
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (roles && !roles.includes(user.role))
    return (
      <p role="alert" className="py-12">
        You do not have access to this page.
      </p>
    );
  return children;
}
