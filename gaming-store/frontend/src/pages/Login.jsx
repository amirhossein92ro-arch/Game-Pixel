import { Link } from 'react-router-dom';

function Login() {
  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={(e) => e.preventDefault()}>
        <h1>Welcome Back</h1>
        <p className="subtitle">Sign in to your NEXUS account</p>
        <div className="form-group">
          <label>Email</label>
          <input type="email" placeholder="you@example.com" />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" placeholder="••••••••" />
        </div>
        <button type="submit" className="btn btn-primary">Sign In</button>
        <p className="switch-text">
          Don't have an account? <Link to="/register">Sign Up</Link>
        </p>
      </form>
    </div>
  );
}

export default Login;