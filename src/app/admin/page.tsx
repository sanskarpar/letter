"use client";
import React, { useState } from "react";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { app } from "@/firebase/config";
import { useRouter } from "next/navigation";
import { ArrowLeft, UserPlus, Shield } from "lucide-react";
import { initializeApp as initializeAdminApp, getApps as getAdminApps } from "firebase/app";
import { getAuth as getAdminAuth } from "firebase/auth";

const AdminPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("user");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
        const mainAuth = getAuth(app);
        const currentUser = mainAuth.currentUser;

        // Verify current user is logged in
        if (!currentUser) {
        throw new Error("You must be logged in as admin");
        }

        // Check if current user has admin role in users collection
        const db = getFirestore(app);
        const userDoc = await getDoc(doc(db, "users", currentUser.uid));
        
        if (!userDoc.exists() || userDoc.data()?.role !== "admin") {
        throw new Error("Only admins can create users");
        }
      // Create a secondary Firebase app instance for admin actions
      let secondaryApp;
      if (getAdminApps().length === 1) {
        secondaryApp = initializeAdminApp(
          {
            apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
            authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
          },
          "Secondary"
        );
      } else {
        secondaryApp = getAdminApps()[1];
      }
      const secondaryAuth = getAdminAuth(secondaryApp);

      // Create user in Firebase Authentication using secondary instance
      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        email,
        password
      );

      // Store additional user data in Firestore (use main app)
      await setDoc(doc(db, "users", userCredential.user.uid), {
        name,
        email,
        role,
        createdAt: new Date(),
      });

      setSuccess("User created successfully!");
      setEmail("");
      setPassword("");
      setName("");
      setRole("user");

      // Sign out from secondary auth to avoid session issues
      await secondaryAuth.signOut();
    } catch (err: any) {
      setError(err.message || "Failed to create user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="max-w-md mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-md rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => router.back()}
              className="text-blue-600 hover:text-blue-800 flex items-center"
            >
              <ArrowLeft className="w-5 h-5 mr-1" />
              Back
            </button>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center">
              <Shield className="w-6 h-6 mr-2 text-purple-600" />
              Admin Panel
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
                {success}
              </div>
            )}

            <div>
              <label className="block text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                minLength={6}
              />
            </div>

            <div>
              <label className="block text-gray-700 mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="user">User</option>
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center"
            >
              {loading ? (
                "Processing..."
              ) : (
                <>
                  <UserPlus className="w-5 h-5 mr-2" />
                  Add User
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;