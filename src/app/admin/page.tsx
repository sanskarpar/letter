"use client";
import React, { useState, useEffect } from "react";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, Timestamp } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { app } from "@/firebase/config";
import { useRouter } from "next/navigation";
import { ArrowLeft, UserPlus, Shield, Mail, Users } from "lucide-react";
import { initializeApp as initializeAdminApp, getApps as getAdminApps } from "firebase/app";
import { getAuth as getAdminAuth } from "firebase/auth";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type Mail = {
  title: string;
  fileUrl: string;
  fileName: string;
  uploadedAt: Date;
  uploadedBy: string;
  status: "unread" | "read";
};

const AdminPage = () => {
  // User creation state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("customer");
  
  // Mail upload state
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [mailTitle, setMailTitle] = useState("");
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [verifyingAdmin, setVerifyingAdmin] = useState(true);
  const [activeTab, setActiveTab] = useState<"createUser" | "uploadMail">("createUser");
  const [currentUserRole, setCurrentUserRole] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState(false);
  
  const router = useRouter();

  // Verify admin status on component mount
  useEffect(() => {
    const verifyAdmin = async () => {
      const auth = getAuth(app);
      const db = getFirestore(app);
      
      auth.onAuthStateChanged(async (user) => {
        if (user) {
          try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (!userDoc.exists() || userDoc.data()?.role !== "admin") {
              router.push("/unauthorized");
            } else {
              setCurrentUserRole(userDoc.data()?.role || "");
              setIsAdmin(true);
              
              // Load users list
              const usersCollection = collection(db, "users");
              const usersSnapshot = await getDocs(usersCollection);
              const usersList = usersSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              })) as User[];
              setUsers(usersList);
            }
          } catch (error) {
            console.error("Error verifying admin status:", error);
            router.push("/login");
          } finally {
            setVerifyingAdmin(false);
          }
        } else {
          router.push("/login");
          setVerifyingAdmin(false);
        }
      });
    };

    verifyAdmin();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const mainAuth = getAuth(app);
      const currentUser = mainAuth.currentUser;

      if (!currentUser) {
        throw new Error("You must be logged in as admin");
      }

      // Verify admin status before proceeding
      if (!isAdmin) {
        throw new Error("Only admins can create users");
      }

      const db = getFirestore(app);

      let secondaryApp;
      if (getAdminApps().length === 1) {
        secondaryApp = initializeAdminApp(
          {
            apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
            authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
            messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
            appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
          },
          "Secondary"
        );
      } else {
        secondaryApp = getAdminApps()[1];
      }
      const secondaryAuth = getAdminAuth(secondaryApp);

      const userCredential = await createUserWithEmailAndPassword(
        secondaryAuth,
        email,
        password
      );

      // Create the subscription end date (January 1, 2100 at 5:30:00 AM UTC+5:30)
      const subscriptionEndDate = new Date('2100-01-01T00:00:00.000Z');

      await setDoc(doc(db, "users", userCredential.user.uid), {
        name,
        email,
        role,
        createdAt: Timestamp.now(),
        credits: 5,
        planType: "free",
        subscriptionEndDate: Timestamp.fromDate(subscriptionEndDate),
      });

      setSuccess("User created successfully!");
      setEmail("");
      setPassword("");
      setName("");
      setRole("customer");

      // Refresh users list
      const usersCollection = collection(db, "users");
      const usersSnapshot = await getDocs(usersCollection);
      const usersList = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as User[];
      setUsers(usersList);

      await secondaryAuth.signOut();
    } catch (err: any) {
      setError(err.message || "Failed to create user");
    } finally {
      setLoading(false);
    }
  };

  const handleMailUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const auth = getAuth(app);
      if (!auth.currentUser) {
        throw new Error("You must be logged in as admin");
      }

      // Verify admin status before proceeding
      if (!isAdmin) {
        throw new Error("Only admins can upload mail");
      }

      if (!selectedUserId) {
        throw new Error("Please select a user");
      }
      if (!pdfFile) {
        throw new Error("Please select a PDF file");
      }
      if (!mailTitle) {
        throw new Error("Please enter a title for the mail");
      }

      const db = getFirestore(app);
      const storage = getStorage(app);
      
      // Create a unique filename to avoid conflicts
      const timestamp = Date.now();
      const sanitizedTitle = mailTitle.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `${sanitizedTitle}-${timestamp}.pdf`;
      
      // Upload file to storage
      const storageRef = ref(storage, `letters/${selectedUserId}/${fileName}`);
      
      console.log("Uploading to path:", `letters/${selectedUserId}/${fileName}`);
      
      const uploadResult = await uploadBytes(storageRef, pdfFile);
      const downloadURL = await getDownloadURL(uploadResult.ref);

      // Store mail data in Firestore
      const mailData = {
        title: mailTitle,
        fileUrl: downloadURL,
        fileName: pdfFile.name,
        uploadedAt: new Date(),
        uploadedBy: auth.currentUser.uid,
        ownerId: selectedUserId,
        status: "unread"
      };

      // Use a sanitized document ID
      const docId = `${sanitizedTitle}_${timestamp}`;
      const userMailRef = doc(db, "users", selectedUserId, "mails", docId);
      await setDoc(userMailRef, mailData);

      setSuccess("Mail uploaded successfully!");
      setPdfFile(null);
      setMailTitle("");
      setSelectedUserId("");
      
      // Reset file input
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }
      
    } catch (err: any) {
      console.error("Mail upload error:", err);
      console.error("Error details:", {
        code: err.code,
        message: err.message,
        customData: err.customData
      });
      setError(err.message || "Failed to upload mail. Please check your permissions.");
    } finally {
      setLoading(false);
    }
  };

  if (verifyingAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Verifying admin privileges...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
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

          <div className="flex border-b mb-6">
            <button
              className={`py-2 px-4 font-medium ${activeTab === "createUser" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}
              onClick={() => setActiveTab("createUser")}
            >
              <UserPlus className="w-5 h-5 mr-2 inline" />
              Create User
            </button>
            <button
              className={`py-2 px-4 font-medium ${activeTab === "uploadMail" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}
              onClick={() => setActiveTab("uploadMail")}
            >
              <Mail className="w-5 h-5 mr-2 inline" />
              Upload Mail
            </button>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
              {success}
            </div>
          )}

          {activeTab === "createUser" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  <option value="customer">Customer</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center"
              >
                {loading ? (
                  "Creating..."
                ) : (
                  <>
                    <UserPlus className="w-5 h-5 mr-2" />
                    Create User
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleMailUpload} className="space-y-4">
              <div>
                <label className="block text-gray-700 mb-1">Select User</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- Select a user --</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email}) - {user.role}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-700 mb-1">Mail Title</label>
                <input
                  type="text"
                  value={mailTitle}
                  onChange={(e) => setMailTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  placeholder="Enter a descriptive title for the mail"
                />
              </div>

              <div>
                <label className="block text-gray-700 mb-1">PDF File</label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  key={`${selectedUserId}-${mailTitle}`}
                />
                {pdfFile && (
                  <p className="text-sm text-gray-600 mt-1">
                    Selected: {pdfFile.name} ({(pdfFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center"
              >
                {loading ? (
                  "Uploading..."
                ) : (
                  <>
                    <Mail className="w-5 h-5 mr-2" />
                    Upload Mail
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPage;