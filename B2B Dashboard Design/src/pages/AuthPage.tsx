import { useState, useEffect } from "react";
import axios from "axios";
import { Eye, EyeOff, Sun, Moon } from "lucide-react";

type Mode = "choice" | "login" | "signup";

export default function AuthPage() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check localStorage or system preference
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);
  const isGitHubPages = window.location.hostname.includes("github.io");
  const [mode, setMode] = useState<Mode>(isGitHubPages ? "login" : "choice"); // Skip choice screen on GitHub Pages

  const [form, setForm] = useState({
    name: isGitHubPages ? "Test User" : "",
    email: isGitHubPages ? "test@quantara.ai" : "",
    password: isGitHubPages ? "testpassword123" : "",
  });
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      if (mode === "login") {
        if (isGitHubPages && form.email.trim() === "test@quantara.ai" && form.password === "testpassword123") {
          localStorage.setItem("token", "fake-jwt-token-for-github-pages");
          localStorage.setItem("userName", "Test User");
          window.location.reload();
          return;
        }

        const res = await axios.post("http://localhost:5000/auth/login", {
          email: form.email,
          password: form.password,
        });

        localStorage.setItem("token", res.data.token);
        if (res.data.user && res.data.user.name) {
          localStorage.setItem("userName", res.data.user.name);
        }
        window.location.reload();
      }

      if (mode === "signup") {
        await axios.post("http://localhost:5000/auth/signup", {
          name: form.name,
          email: form.email,
          password: form.password,
        });

        setMode("login");
        setError(""); // Clear any previous errors
        alert("Account created! Please sign in.");
      }
    } catch (err: any) {
      console.error("Auth Error:", err);
      // Try to get the specific error message from backend
      const errorMessage = err.response?.data?.message ||
        err.response?.data?.error ||
        "Authentication failed. Please try again.";
      setError(errorMessage);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 transition-colors duration-300">
      {/* Theme Toggle Button */}
      <button
        onClick={toggleTheme}
        className="fixed top-6 right-6 p-3 rounded-full shadow-lg transition-all duration-300 hover:scale-110 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
        title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {isDarkMode ? (
          <Sun className="w-5 h-5 text-yellow-500" />
        ) : (
          <Moon className="w-5 h-5 text-gray-600" />
        )}
      </button>

      <div className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700">

        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2 text-lime-600">QUANTARA</h1>
          <p className="text-gray-500 dark:text-gray-400">
            AI-Powered B2B Route Intelligence
          </p>
        </div>

        {/* 🔹 MODE 1: CHOICE SCREEN (Landing) */}
        {mode === "choice" && (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 dark:text-white mb-6 text-center">
              Get Started
            </h2>

            <div className="space-y-4">
              <button
                onClick={() => setMode("login")}
                className="w-full bg-lime-600 hover:bg-lime-700 text-white py-3 rounded-lg font-bold shadow-lg shadow-lime-500/30 transition-all"
              >
                Sign In
              </button>

              <button
                onClick={() => setMode("signup")}
                className="w-full bg-white dark:bg-gray-700 border-2 border-lime-600 text-lime-600 dark:text-lime-400 hover:bg-lime-50 dark:hover:bg-gray-600 py-3 rounded-lg font-bold transition-all"
              >
                Create Account
              </button>
            </div>
          </>
        )}

        {/* 🔹 MODE 2: LOGIN */}
        {mode === "login" && (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 dark:text-white mb-2">
              Sign In
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Welcome back to Quantara
            </p>

            {error && <p className="text-red-500 text-sm mb-4 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800">{error}</p>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="Enter your email address"
                  className="w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-lime-500 focus:border-transparent outline-none transition-all dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                  required
                />
              </div>

              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    className="w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-lime-500 focus:border-transparent outline-none transition-all dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    required
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <button type="button" className="text-sm text-lime-600 hover:text-lime-700 dark:text-lime-400 font-medium">
                  Forgot Password?
                </button>
              </div>

              <button className="w-full bg-lime-600 hover:bg-lime-700 text-white py-3 rounded-lg font-bold shadow-lg shadow-lime-500/30 transition-all mt-2">
                Sign In
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white text-sm"
                onClick={() => setMode("choice")}
              >
                ← Back to options
              </button>
            </div>

            <p className="text-sm text-center text-gray-500 mt-6 pt-4 border-t dark:border-gray-700">
              Don't have an account?{" "}
              <button
                className="text-lime-600 dark:text-lime-400 font-bold hover:underline"
                onClick={() => setMode("signup")}
              >
                Sign Up
              </button>
            </p>
          </>
        )}

        {/* 🔹 MODE 3: SIGNUP */}
        {mode === "signup" && (
          <>
            <h2 className="text-2xl font-semibold text-gray-800 dark:text-white mb-2">
              Create Account
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Start your journey with Quantara
            </p>

            {error && <p className="text-red-500 text-sm mb-4 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800">{error}</p>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
                <input
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-lime-500 focus:border-transparent outline-none transition-all dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value })
                  }
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="Enter your email address"
                  className="w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-lime-500 focus:border-transparent outline-none transition-all dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                  value={form.email}
                  onChange={(e) =>
                    setForm({ ...form, email: e.target.value })
                  }
                  required
                />
              </div>

              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    className="w-full px-4 py-3 rounded-lg border focus:ring-2 focus:ring-lime-500 focus:border-transparent outline-none transition-all dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    required
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <button className="w-full bg-lime-600 hover:bg-lime-700 text-white py-3 rounded-lg font-bold shadow-lg shadow-lime-500/30 transition-all mt-2">
                Sign Up
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white text-sm"
                onClick={() => setMode("choice")}
              >
                ← Back to options
              </button>
            </div>

            <p className="text-sm text-center text-gray-500 mt-6 pt-4 border-t dark:border-gray-700">
              Already have an account?{" "}
              <button
                className="text-lime-600 dark:text-lime-400 font-bold hover:underline"
                onClick={() => setMode("login")}
              >
                Sign In
              </button>
            </p>
          </>
        )}

      </div>
    </div>
  );
}

