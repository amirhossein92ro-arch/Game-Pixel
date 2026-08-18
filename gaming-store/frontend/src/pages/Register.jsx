import { Link } from 'react-router-dom';

function Register() {
  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={(e) => e.preventDefault()}>
        <h1>Create Account</h1>
        <p className="subtitle">Join NEXUS Gaming today</p>
        <div className="form-group">
          <label>Username</label>
          <input type="text" placeholder="Your username" />
        </div>
        <div className="form-group">
          <label>Email</label>
          <input type="email" placeholder="you@example.com" />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" placeholder="••••••••" />
        </div>
        <div className="form-group">
          <label>Confirm Password</label>
          <input type="password" placeholder="••••••••" />
        </div>
        <button type="submit" className="btn btn-primary">Create Account</button>
        <p className="switch-text">
          Already have an account? <Link to="/login">Sign In</Link>
        </p>
      </form>
    </div>
  );
}

export default Register;