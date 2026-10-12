import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login, DEMO_EMAIL, DEMO_PASSWORD } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(DEMO_EMAIL);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);
    if (result.ok) {
      setError("");
      navigate("/app/dashboard");
    } else {
      setError(result.message || "Invalid email or password.");
    }
  };

  return (
    <div className="login-screen">
      <div className="login-left">
        <img src="/assets/logo.png" alt="Rush Republic" className="login-logo" />
        <h1 className="login-brand">RUSH<br />REPUBLIC</h1>
        <p className="login-tagline">for the team, by the team</p>
        <p className="login-sub">INSTAGRAM<br />SCHEDULER</p>
      </div>
      <div className="login-right">
        <form className="login-form" onSubmit={handleSubmit}>
          <h2>Sign in</h2>
          <p className="login-hint">Internal access only.</p>

          <label htmlFor="login-email">Email</label>
          <input
            type="email" id="login-email" required
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@rushrepublic.com"
          />

          <label htmlFor="login-password">Password</label>
          <input
            type="password" id="login-password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? "SIGNING IN..." : "LOGIN"}
          </button>
          <a href="#" className="login-forgot" onClick={(e) => e.preventDefault()}>Forgot Password?</a>

          <div className="login-demo">
            <span>Demo credentials</span>
            <code>{DEMO_EMAIL} / {DEMO_PASSWORD}</code>
          </div>
        </form>
      </div>
    </div>
  );
}
