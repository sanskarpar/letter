"use client";
import React, { useState, useEffect } from "react";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, Timestamp, updateDoc, query, where } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { app } from "@/firebase/config";
import { useRouter } from "next/navigation";
import { ArrowLeft, UserPlus, Shield, Mail, Users, Package, CheckCircle, Clock, FileText } from "lucide-react";
import { initializeApp as initializeAdminApp, getApps as getAdminApps } from "firebase/app";
import { getAuth as getAdminAuth } from "firebase/auth";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type Letter = {
  id: string;
  senderName: string;
  receiverName: string;
  dateReceived: Date;
  status: "unscanned" | "processing" | "completed";
  userId: string;
  userRequests?: {
    pdfScan: boolean;
    delivery: boolean;
    deliveryAddress?: string;
    requestedAt: Date;
    creditsDeducted: number;
  };
  adminActions?: {
    scanned: boolean;
    delivered: boolean;
    pdfUrl?: string;
    completedAt?: Date;
  };
};

type UserRequest = {
  id: string;
  letterId: string;
  userId: string;
  userName: string;
  userEmail: string;
  senderName: string;
  receiverName: string;
  pdfScan: boolean;
  delivery: boolean;
  deliveryAddress?: string;
  requestedAt: Date;
  creditsDeducted: number;
  status: "pending" | "processing" | "completed";
  adminActions?: {
    scanned?: boolean;
    delivered?: boolean;
  };
};

const AdminPage = () => {
  // User creation state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("customer");
  
  // Letter addition state
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [senderName, setSenderName] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [dateReceived, setDateReceived] = useState("");
  
  // Request management state
  const [userRequests, setUserRequests] = useState<UserRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<UserRequest | null>(null);
  const [pdfFiles, setPdfFiles] = useState<{[key: string]: File}>({});
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [verifyingAdmin, setVerifyingAdmin] = useState(true);
  const [activeTab, setActiveTab] = useState<"createUser" | "addLetter" | "manageRequests">("createUser");
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
              
              // Load pending requests
              await loadPendingRequests();
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

  const loadPendingRequests = async () => {
    try {
      const db = getFirestore(app);
      const requestsQuery = query(
        collection(db, "letterRequests"),
        where("status", "in", ["pending", "processing"])
      );
      const snapshot = await getDocs(requestsQuery);
      
      const requests = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        requestedAt: doc.data().requestedAt?.toDate(),
      })) as UserRequest[];
      
      setUserRequests(requests);
    } catch (error) {
      console.error("Error loading requests:", error);
    }
  };

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

      const subscriptionEndDate = new Date('2100-01-01T00:00:00.000Z');

      await setDoc(doc(db, "users", userCredential.user.uid), {
        name,
        email,
        role,
        createdAt: Timestamp.now(),
        credits: 0,
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

  const handleLetterAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const auth = getAuth(app);
      if (!auth.currentUser) {
        throw new Error("You must be logged in as admin");
      }

      if (!isAdmin) {
        throw new Error("Only admins can add letters");
      }

      if (!selectedUserId || !senderName || !receiverName || !dateReceived) {
        throw new Error("Please fill in all required fields");
      }

      const db = getFirestore(app);
      
      const letterData = {
        senderName,
        receiverName,
        dateReceived: Timestamp.fromDate(new Date(dateReceived)),
        status: "unscanned",
        userId: selectedUserId,
        addedBy: auth.currentUser.uid,
        addedAt: Timestamp.now(),
      };

      const letterRef = doc(collection(db, "letters"));
      await setDoc(letterRef, letterData);

      setSuccess("Letter added successfully!");
      setSenderName("");
      setReceiverName("");
      setDateReceived("");
      setSelectedUserId("");
      
    } catch (err: any) {
      console.error("Letter add error:", err);
      setError(err.message || "Failed to add letter");
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (requestId: string, file: File | null) => {
    if (file) {
      setPdfFiles(prev => ({
        ...prev,
        [requestId]: file
      }));
    } else {
      setPdfFiles(prev => {
        const newFiles = { ...prev };
        delete newFiles[requestId];
        return newFiles;
      });
    }
  };

  const checkAndCompleteRequest = async (request: UserRequest, db: any) => {
    // Check if both requested services are completed
    const scanCompleted = !request.pdfScan || request.adminActions?.scanned;
    const deliveryCompleted = !request.delivery || request.adminActions?.delivered;
    
    if (scanCompleted && deliveryCompleted) {
      // Mark the entire request as completed
      await updateDoc(doc(db, "letterRequests", request.id), {
        status: "completed",
        "adminActions.completedAt": Timestamp.now(),
      });
      
      // Update the letter status
      await updateDoc(doc(db, "letters", request.letterId), {
        status: "completed",
        "adminActions.completedAt": Timestamp.now(),
      });
      
      return true; // Request was completed
    }
    
    return false; // Request still pending
  };

  const handleScanUpload = async (request: UserRequest) => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const auth = getAuth(app);
      const db = getFirestore(app);
      
      if (!auth.currentUser || !isAdmin) {
        throw new Error("Unauthorized");
      }

      const selectedFile = pdfFiles[request.id];
      if (!selectedFile) {
        throw new Error("Please select a PDF file");
      }

      if (selectedFile.type !== "application/pdf") {
        throw new Error("Please select a valid PDF file");
      }

      if (selectedFile.size > 10 * 1024 * 1024) {
        throw new Error("PDF file size must be less than 10MB");
      }

      // Update request status to processing
      await updateDoc(doc(db, "letterRequests", request.id), {
        status: "processing",
        "adminActions.startedAt": Timestamp.now(),
        "adminActions.adminId": auth.currentUser.uid,
      });

      // Upload PDF
      const storage = getStorage(app);
      const timestamp = Date.now();
      const fileName = `scanned_${request.letterId}_${timestamp}.pdf`;
      const storageRef = ref(storage, `scanned-letters/${request.userId}/${fileName}`);
      
      const uploadResult = await uploadBytes(storageRef, selectedFile);
      const downloadURL = await getDownloadURL(uploadResult.ref);

      // Update letter with scan info
      await updateDoc(doc(db, "letters", request.letterId), {
        "adminActions.scanned": true,
        "adminActions.pdfUrl": downloadURL,
        "adminActions.scannedAt": Timestamp.now(),
        status: "processing"
      });

      // Update request with scan completion
      await updateDoc(doc(db, "letterRequests", request.id), {
        "adminActions.scanned": true,
      });

      // Clear the selected file
      setPdfFiles(prev => {
        const newFiles = { ...prev };
        delete newFiles[request.id];
        return newFiles;
      });

      // Update the request in state
      const updatedRequest = {
        ...request,
        adminActions: {
          ...request.adminActions,
          scanned: true
        }
      };

      // Check if request is now complete
      const isCompleted = await checkAndCompleteRequest(updatedRequest, db);
      
      if (isCompleted) {
        setSuccess("PDF scan completed and request finished!");
      } else {
        setSuccess("PDF scan completed successfully!");
      }
      
      // Reload requests
      await loadPendingRequests();
      
    } catch (err: any) {
      console.error("Scan upload error:", err);
      setError(err.message || "Failed to upload scan");
    } finally {
      setLoading(false);
    }
  };

  const handleMarkDelivered = async (request: UserRequest) => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const auth = getAuth(app);
      const db = getFirestore(app);
      
      if (!auth.currentUser || !isAdmin) {
        throw new Error("Unauthorized");
      }

      // Update request status to processing if not already
      if (request.status === "pending") {
        await updateDoc(doc(db, "letterRequests", request.id), {
          status: "processing",
          "adminActions.startedAt": Timestamp.now(),
          "adminActions.adminId": auth.currentUser.uid,
        });
      }

      // Update letter with delivery info
      await updateDoc(doc(db, "letters", request.letterId), {
        "adminActions.delivered": true,
        "adminActions.deliveredAt": Timestamp.now(),
        status: "processing"
      });

      // Update request with delivery completion
      await updateDoc(doc(db, "letterRequests", request.id), {
        "adminActions.delivered": true,
      });

      // Update the request in state
      const updatedRequest = {
        ...request,
        adminActions: {
          ...request.adminActions,
          delivered: true
        }
      };

      // Check if request is now complete
      const isCompleted = await checkAndCompleteRequest(updatedRequest, db);
      
      if (isCompleted) {
        setSuccess("Delivery marked and request finished!");
      } else {
        setSuccess("Delivery marked successfully!");
      }
      
      // Reload requests
      await loadPendingRequests();
      
    } catch (err: any) {
      console.error("Mark delivered error:", err);
      setError(err.message || "Failed to mark as delivered");
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
      <div className="max-w-6xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
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
              className={`py-2 px-4 font-medium ${activeTab === "addLetter" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}
              onClick={() => setActiveTab("addLetter")}
            >
              <Mail className="w-5 h-5 mr-2 inline" />
              Add Letter
            </button>
            <button
              className={`py-2 px-4 font-medium ${activeTab === "manageRequests" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-500"}`}
              onClick={() => setActiveTab("manageRequests")}
            >
              <Package className="w-5 h-5 mr-2 inline" />
              Manage Requests ({userRequests.length})
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

          {activeTab === "createUser" && (
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
                {loading ? "Creating..." : (
                  <>
                    <UserPlus className="w-5 h-5 mr-2" />
                    Create User
                  </>
                )}
              </button>
            </form>
          )}

          {activeTab === "addLetter" && (
            <form onSubmit={handleLetterAdd} className="space-y-4">
              <div>
                <label className="block text-gray-700 mb-1">Select User</label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">-- Select a user --</option>
                  {users.filter(user => user.role === 'customer').map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-gray-700 mb-1">Sender Name</label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  placeholder="Enter sender's name"
                />
              </div>

              <div>
                <label className="block text-gray-700 mb-1">Receiver Name</label>
                <input
                  type="text"
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                  placeholder="Enter receiver's name"
                />
              </div>

              <div>
                <label className="block text-gray-700 mb-1">Date Received</label>
                <input
                  type="date"
                  value={dateReceived}
                  onChange={(e) => setDateReceived(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center"
              >
                {loading ? "Adding..." : (
                  <>
                    <Mail className="w-5 h-5 mr-2" />
                    Add Letter
                  </>
                )}
              </button>
            </form>
          )}

          {activeTab === "manageRequests" && (
            <div className="space-y-6">
              {userRequests.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-gray-500">No pending requests</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {userRequests.map((request) => (
                    <div key={request.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900">
                            {request.userName} ({request.userEmail})
                          </h4>
                          <p className="text-sm text-gray-600">
                            Letter: {request.senderName} → {request.receiverName}
                          </p>
                          <div className="mt-2 space-y-1">
                            {request.pdfScan && (
                              <span className={`inline-block text-xs px-2 py-1 rounded ${
                                request.adminActions?.scanned
                                  ? "bg-green-100 text-green-800" 
                                  : "bg-blue-100 text-blue-800"
                              }`}>
                                PDF Scan {request.adminActions?.scanned ? "Completed" : "Requested"}
                              </span>
                            )}
                            {request.delivery && (
                              <span className={`inline-block text-xs px-2 py-1 rounded ml-2 ${
                                request.adminActions?.delivered
                                  ? "bg-green-100 text-green-800" 
                                  : "bg-orange-100 text-orange-800"
                              }`}>
                                Delivery {request.adminActions?.delivered ? "Completed" : "Requested"}
                              </span>
                            )}
                          </div>
                          {request.deliveryAddress && (
                            <p className="text-sm text-gray-600 mt-1">
                              Delivery Address: {request.deliveryAddress}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            Credits Deducted: {request.creditsDeducted} | 
                            Requested: {request.requestedAt.toLocaleDateString()}
                          </p>
                        </div>
                        <div className="ml-4 space-y-2">
                          {request.pdfScan && !request.adminActions?.scanned && (
                            <div className="space-y-2">
                              <div>
                                <label className="block text-xs text-gray-600 mb-1">
                                  Select PDF file:
                                </label>
                                <input
                                  type="file"
                                  accept="application/pdf"
                                  onChange={(e) => handleFileSelect(request.id, e.target.files?.[0] || null)}
                                  className="block w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                />
                                {pdfFiles[request.id] && (
                                  <p className="text-xs text-green-600 mt-1">
                                    Selected: {pdfFiles[request.id].name}
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={() => handleScanUpload(request)}
                                disabled={loading || !pdfFiles[request.id]}
                                className="block w-full bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <FileText className="w-4 h-4 inline mr-1" />
                                {loading ? "Uploading..." : "Upload Scan"}
                              </button>
                            </div>
                          )}
                          {request.delivery && !request.adminActions?.delivered && (
                            <button
                              onClick={() => handleMarkDelivered(request)}
                              disabled={loading}
                              className="block w-full bg-green-600 text-white px-3 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50"
                            >
                              <CheckCircle className="w-4 h-4 inline mr-1" />
                              {loading ? "Processing..." : "Mark Delivered"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminPage;