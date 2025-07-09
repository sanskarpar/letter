"use client";
import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, doc, getDoc, collection, getDocs, query, orderBy, where, addDoc, Timestamp, updateDoc, runTransaction } from "firebase/firestore";
import { app } from "@/firebase/config";
import { CreditCard, Calendar, User, Package, Shield, Mail, Eye, FileText, Download, Clock, CheckCircle, Truck, Scan, AlertCircle } from 'lucide-react';

type Letter = {
  id: string;
  senderName: string;
  receiverName: string;
  dateReceived: any;
  status: "unscanned" | "processing" | "completed";
  userId: string;
  addedAt: any;
  userRequests?: {
    pdfScan: boolean;
    delivery: boolean;
    deliveryAddress?: string;
    requestedAt: any;
    creditsDeducted: number;
  };
  adminActions?: {
    scanned: boolean;
    delivered: boolean;
    pdfUrl?: string;
    completedAt?: any;
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
  requestedAt: any;
  creditsDeducted: number;
  status: "pending" | "processing" | "completed";
};

const LetterRequestModal = ({ 
    letter, 
    onClose, 
    onSubmit, 
    userCredits 
  }: { 
    letter: Letter; 
    onClose: () => void; 
    onSubmit: (requests: { pdfScan: boolean; delivery: boolean; deliveryAddress?: string }) => void;
    userCredits: number;
  }) => {
    const [pdfScan, setPdfScan] = useState(false);
    const [delivery, setDelivery] = useState(false);
    const [deliveryAddress, setDeliveryAddress] = useState("");
    
    const totalCredits = (pdfScan ? 1 : 0) + (delivery ? 1 : 0);
    const canAfford = userCredits >= totalCredits;

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!pdfScan && !delivery) {
        alert("Please select at least one service");
        return;
      }
      if (delivery && !deliveryAddress.trim()) {
        alert("Please provide a delivery address");
        return;
      }
      if (!canAfford) {
        alert("Insufficient credits");
        return;
      }
      
      // Only include deliveryAddress if delivery is selected
      const requestData = {
        pdfScan,
        delivery,
        ...(delivery && { deliveryAddress: deliveryAddress.trim() })
      };
      
      onSubmit(requestData);
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-6 max-w-md w-full">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-black">Request Services</h3>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              ✕
            </button>
          </div>
          
          <div className="mb-4 p-3 bg-gray-50 rounded">
            <p className="font-medium text-black">Letter Details:</p>
            <p className="text-sm text-black">From: {letter.senderName}</p>
            <p className="text-sm text-black">To: {letter.receiverName}</p>
            <p className="text-sm text-black">Date: {letter.dateReceived?.toDate?.()?.toLocaleDateString() || 'N/A'}</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="space-y-3">
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={pdfScan}
                    onChange={(e) => setPdfScan(e.target.checked)}
                    className="w-4 h-4 text-blue-600 text-black"
                  />
                  <span className="flex-1 text-black">PDF Scan (1 credit)</span>
                  <Scan className="w-4 h-4 text-blue-600" />
                </label>
                
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={delivery}
                    onChange={(e) => setDelivery(e.target.checked)}
                    className="w-4 h-4 text-green-600 text-black"
                  />
                  <span className="flex-1 text-black">Delivery Service (1 credit)</span>
                  <Truck className="w-4 h-4 text-green-600" />
                </label>
              </div>

              {delivery && (
                <div>
                  <label className="block text-sm font-medium text-black mb-1">
                    Delivery Address
                  </label>
                  <textarea
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                    rows={3}
                    placeholder="Enter complete delivery address"
                    required={delivery}
                  />
                </div>
              )}

              <div className="bg-blue-50 p-3 rounded">
                <div className="flex justify-between text-sm">
                  <span className="text-black">Total Credits Required:</span>
                  <span className="font-medium text-black">{totalCredits}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-black">Your Available Credits:</span>
                  <span className={`font-medium ${canAfford ? 'text-green-600' : 'text-red-600'} text-black`}>
                    {userCredits}
                  </span>
                </div>
              </div>

              {!canAfford && (
                <div className="bg-red-50 border border-red-200 p-3 rounded flex items-center">
                  <AlertCircle className="w-4 h-4 text-red-600 mr-2" />
                  <span className="text-red-700 text-sm text-black">Insufficient credits for this request</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 text-black border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!canAfford || (!pdfScan && !delivery)}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit Request
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  };

const MailScannerDashboard = ({ userData, userLetters, userRequests, onMakeRequest }: { 
  userData: any; 
  userLetters: Letter[];
  userRequests: UserRequest[];
  onMakeRequest: (letterId: string, requests: { pdfScan: boolean; delivery: boolean; deliveryAddress?: string }) => Promise<void>;
}) => {
  const router = useRouter();
  const [selectedLetter, setSelectedLetter] = useState<Letter | null>(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedLetterForRequest, setSelectedLetterForRequest] = useState<Letter | null>(null);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);

  const formatDate = (date: any) => {
    if (!date) return "N/A";
    // Support Firestore Timestamp or JS Date
    if (date.toDate) {
      return date.toDate().toLocaleDateString();
    }
    if (date instanceof Date) {
      return date.toLocaleDateString();
    }
    return "N/A";
  };

  const handleMakeRequest = (letter: Letter) => {
    setSelectedLetterForRequest(letter);
    setShowRequestModal(true);
  };

  const handleSubmitRequest = async (requests: { pdfScan: boolean; delivery: boolean; deliveryAddress?: string }) => {
    if (selectedLetterForRequest) {
      await onMakeRequest(selectedLetterForRequest.id, requests);
      setShowRequestModal(false);
      setSelectedLetterForRequest(null);
    }
  };

  const getLetterStatus = (letter: Letter) => {
    const request = userRequests.find(r => r.letterId === letter.id);
    if (request) {
      switch (request.status) {
        case "pending":
          return { text: "Request Pending", color: "bg-yellow-100 text-yellow-800", icon: Clock };
        case "processing":
          return { text: "Processing", color: "bg-blue-100 text-blue-800", icon: Clock };
        case "completed":
          return { text: "Completed", color: "bg-green-100 text-green-800", icon: CheckCircle };
      }
    }
    return { text: "No Request", color: "bg-gray-100 text-gray-800", icon: Mail };
  };

  const canMakeRequest = (letter: Letter) => {
    const request = userRequests.find(r => r.letterId === letter.id);
    return !request || request.status === "completed";
  };

  const handleLogout = async () => {
    const auth = getAuth(app);
    await signOut(auth);
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="bg-white shadow-md rounded-lg p-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Hey {userData?.name || 'there'}</h2>
              <p className="text-gray-600">Welcome to your dashboard</p>
            </div>
            <div className="flex gap-2 relative">
              {userData?.role === 'admin' && (
                <button
                  onClick={() => router.push("/admin")}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg shadow-md hover:bg-purple-700 transition-colors"
                >
                  <Shield className="w-5 h-5 inline-block mr-1" />
                  Admin
                </button>
              )}
              {/* Account dropdown */}
              <div className="relative">
                <button
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-md hover:bg-blue-700 transition-colors flex items-center"
                  onClick={() => setAccountDropdownOpen((v) => !v)}
                >
                  <User className="w-5 h-5 inline-block mr-1" />
                  Account
                  <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {accountDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                    <button
                      onClick={handleLogout}
                      className="block w-full text-left px-4 py-2 text-black hover:bg-gray-100 rounded-t-lg"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-blue-50 border border-blue-100 p-6 rounded-lg shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-800">Your Plan</h3>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  userData?.planType === 'premium' 
                    ? 'bg-blue-100 text-blue-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {userData?.planType?.toUpperCase() || 'FREE'}
                </span>
              </div>
              <div className="space-y-4">
                {userData?.planType !== 'free' && (
                  <div>
                    <p className="text-gray-500">Subscription End Date</p>
                    <p className="text-lg font-medium text-gray-800">
                      {userData?.subscriptionEndDate ? formatDate(userData?.subscriptionEndDate) : "N/A"}
                    </p>
                  </div>
                )}
                <button
                  className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
                  onClick={() => router.push("/payments")}
                >
                  {userData?.planType === 'free' ? 'Upgrade Plan' : 'Manage Subscription'}
                </button>
              </div>
            </div>

            <div className="bg-green-50 border border-green-100 p-6 rounded-lg shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-800">Your Credits</h3>
                <Package className="w-6 h-6 text-green-600" />
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-gray-500">Available Credits</p>
                  <p className="text-3xl font-bold text-gray-800">
                    {userData?.credits ?? 0}
                  </p>
                </div>
                <div className="text-sm text-gray-600">
                  <p>• PDF Scan: 1 credit</p>
                  <p>• Delivery: 1 credit</p>
                  <p>• Both services: 2 credits</p>
                </div>
                <button
                  className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors"
                  onClick={() => router.push("/payments")}
                >
                  Buy More Credits
                </button>
              </div>
            </div>

            <div className="bg-orange-50 border border-orange-100 p-6 rounded-lg shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-800">Your Letters</h3>
                <Mail className="w-6 h-6 text-orange-600" />
              </div>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Letters:</span>
                  <span className="font-medium text-black">{userLetters.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Unscanned:</span>
                  <span className="font-medium text-red-600">
                    {userLetters.filter(letter => letter.status === "unscanned").length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Completed:</span>
                  <span className="font-medium text-green-600">
                    {userLetters.filter(letter => letter.status === "completed").length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Active Requests:</span>
                  <span className="font-medium text-blue-600">
                    {userRequests.filter(req => req.status !== "completed").length}
                  </span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 bg-gray-50 border border-gray-100 rounded-lg shadow-sm">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-xl font-semibold text-gray-800 flex items-center">
                  <Mail className="w-5 h-5 mr-2" />
                  Your Letters
                </h3>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {userLetters.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    <Mail className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No letters yet. Letters will appear here once added by admin.</p>
                  </div>
                ) :
                  (
                  <div className="divide-y divide-gray-200">
                    {userLetters.map((letter) => {
                      const status = getLetterStatus(letter);
                      const StatusIcon = status.icon;
                      const request = userRequests.find(r => r.letterId === letter.id);
                      
                      return (
                        <div key={letter.id} className="p-4 hover:bg-gray-100 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium text-gray-800">
                                  From: {letter.senderName}
                                </h4>
                                <span className={`px-2 py-1 text-xs rounded-full ${status.color}`}>
                                  <StatusIcon className="w-3 h-3 inline mr-1" />
                                  {status.text}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600">
                                To: {letter.receiverName}
                              </p>
                              <p className="text-sm text-gray-500">
                                Received: {formatDate(letter.dateReceived)}
                              </p>
                              
                              {request && (
                                <div className="mt-2 text-xs text-gray-600">
                                  <p>Services requested:</p>
                                  <div className="flex gap-2 mt-1">
                                    {request.pdfScan && (
                                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                                        PDF Scan
                                      </span>
                                    )}
                                    {request.delivery && (
                                      <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                                        Delivery
                                      </span>
                                    )}
                                  </div>
                                  {request.deliveryAddress && (
                                    <p className="mt-1 text-xs">Address: {request.deliveryAddress}</p>
                                  )}
                                </div>
                              )}
                            </div>
                            
                            <div className="flex gap-2">
                              {request?.status === "completed" && request.pdfScan && letter.adminActions?.pdfUrl && (
                                <button
                                  onClick={() => setSelectedLetter(letter)} // <-- show PDF in viewer
                                  className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                  title="View PDF"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              )}
                              
                              {request?.status === "completed" && request.pdfScan && letter.adminActions?.pdfUrl && (
                                <a
                                  href={letter.adminActions.pdfUrl}
                                  download
                                  className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                                  title="Download PDF"
                                >
                                  <Download className="w-4 h-4" />
                                </a>
                              )}
                              
                              {canMakeRequest(letter) && (
                                <button
                                  onClick={() => handleMakeRequest(letter)}
                                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
                                >
                                  Request Service
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-1 bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                  <FileText className="w-5 h-5 mr-2" />
                  PDF Viewer
                </h3>
              </div>
              <div className="p-4">
                {selectedLetter && selectedLetter.adminActions?.pdfUrl ? (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-gray-800">
                        {selectedLetter.senderName} → {selectedLetter.receiverName}
                      </h4>
                      <p className="text-sm text-gray-500">
                        {formatDate(selectedLetter.dateReceived)}
                      </p>
                    </div>
                    <div className="border rounded-lg overflow-hidden" style={{ height: '400px' }}>
                      <iframe
                        src={selectedLetter.adminActions.pdfUrl}
                        className="w-full h-full"
                        title="Letter PDF"
                      />
                    </div>
                    <a
                      href={selectedLetter.adminActions.pdfUrl}
                      download
                      className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download PDF
                    </a>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No PDF available to view</p>
                    <p className="text-sm mt-2">Request a PDF scan for your letters</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showRequestModal && selectedLetterForRequest && (
        <LetterRequestModal
          letter={selectedLetterForRequest}
          onClose={() => {
            setShowRequestModal(false);
            setSelectedLetterForRequest(null);
          }}
          onSubmit={handleSubmitRequest}
          userCredits={userData?.credits || 0}
        />
      )}
    </div>
  );
};

// Move DashboardPageInner to a separate component
function DashboardPageInner({ user, setUserData, setSuccessMessage, setUser, setUserLetters, setUserRequests, setError, setLoading, userData, userLetters, userRequests, successMessage, loading, error }: any) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const auth = getAuth(app);
    const db = getFirestore(app);
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.replace("/login");
      } else {
        setUser(firebaseUser);
        
        try {
          // Fetch user data from Firestore
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          if (userDoc.exists()) {
            setUserData(userDoc.data());
          }

          // Fetch user's letters
          const lettersQuery = query(
            collection(db, "letters"),
            where("userId", "==", firebaseUser.uid),
            orderBy("dateReceived", "desc")
          );
          const lettersSnapshot = await getDocs(lettersQuery);
          
          const letters = lettersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Letter[];
          
          setUserLetters(letters);

          // Fetch user's requests
          const requestsQuery = query(
            collection(db, "letterRequests"),
            where("userId", "==", firebaseUser.uid),
            orderBy("requestedAt", "desc")
          );
          const requestsSnapshot = await getDocs(requestsQuery);
          
          const requests = requestsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            requestedAt: doc.data().requestedAt?.toDate()
          })) as UserRequest[];
          
          setUserRequests(requests);
          
          setError(null);
        } catch (error: any) {
          console.error("Error fetching data:", error);
          setError(error.message);
        }
      }
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [router]);

  // Refetch user data if payment was successful (subscription or credits)
  useEffect(() => {
    const successType = searchParams?.get("success");
    if (successType === "subscription" || successType === "credits") {
      setSuccessMessage(
        successType === "subscription"
          ? "Subscription upgraded successfully!"
          : "Credits purchased successfully!"
      );
      // Refetch user data from Firestore
      const fetchUserData = async () => {
        if (!user) return;
        const db = getFirestore(app);
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          setUserData(userDoc.data());
        }
      };
      fetchUserData();
      // Remove the query param from the URL after a short delay
      setTimeout(() => {
        setSuccessMessage(null);
        router.replace("/dashboard");
      }, 2500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user]);

  const handleMakeRequest = async (letterId: string, requests: { pdfScan: boolean; delivery: boolean; deliveryAddress?: string }) => {
    if (!user || !userData) return;
    
    try {
      const db = getFirestore(app);
      const creditsNeeded = (requests.pdfScan ? 1 : 0) + (requests.delivery ? 1 : 0);
      
      if (userData.credits < creditsNeeded) {
        alert("Insufficient credits");
        return;
      }

      // Find the letter
      const letter = userLetters.find((l: Letter) => l.id === letterId);
      if (!letter) {
        alert("Letter not found");
        return;
      }

      // Use a transaction to ensure data consistency
      await runTransaction(db, async (transaction) => {
        // Get references
        const userRef = doc(db, "users", user.uid);
        const letterRef = doc(db, "letters", letterId);
        const requestRef = doc(collection(db, "letterRequests"));

        // Read current user data
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) {
          throw new Error("User document not found");
        }

        const currentCredits = userDoc.data().credits || 0;
        if (currentCredits < creditsNeeded) {
          throw new Error("Insufficient credits");
        }

        // Create the request data
        const requestData: any = {
          letterId,
          userId: user.uid,
          userName: userData.name || user.email,
          userEmail: user.email,
          senderName: letter.senderName,
          receiverName: letter.receiverName,
          pdfScan: requests.pdfScan,
          delivery: requests.delivery,
          requestedAt: Timestamp.now(),
          creditsDeducted: creditsNeeded,
          status: "pending"
        };

        // Only add deliveryAddress if it exists
        if (requests.delivery && requests.deliveryAddress) {
          requestData.deliveryAddress = requests.deliveryAddress;
        }

        // Create the letter request
        transaction.set(requestRef, requestData);

        // Update user's credits
        transaction.update(userRef, {
          credits: currentCredits - creditsNeeded
        });

        // Update letter with user request info
        const letterUpdateData: any = {
          "userRequests": {
            pdfScan: requests.pdfScan,
            delivery: requests.delivery,
            requestedAt: Timestamp.now(),
            creditsDeducted: creditsNeeded
          },
          status: "processing"
        };

        // Only add deliveryAddress if it exists
        if (requests.delivery && requests.deliveryAddress) {
          letterUpdateData.userRequests.deliveryAddress = requests.deliveryAddress;
        }

        transaction.update(letterRef, letterUpdateData);
      });

      // Show success message in the page
      setSuccessMessage("Request submitted successfully!");
      setTimeout(() => {
        setSuccessMessage(null);
        // Instead of reload, refetch user data to update credits
        const fetchUserData = async () => {
          if (!user) return;
          const db = getFirestore(app);
          const userDoc = await getDoc(doc(db, "users", user.uid));
          if (userDoc.exists()) {
            setUserData(userDoc.data());
          }
        };
        fetchUserData();
      }, 2000);
      
    } catch (error: any) {
      console.error("Error making request:", error);
      alert("Error making request: " + error.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (typeof error !== "undefined" && error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 mb-4">
            <Shield className="w-12 h-12 mx-auto mb-2" />
            <h3 className="text-lg font-semibold">Error Loading Data</h3>
            <p className="text-sm">Unable to load your dashboard data.</p>
            <p className="text-xs text-gray-500 mt-2">Error: {error}</p>
          </div>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      {successMessage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
          <div className="bg-green-600 text-white px-6 py-3 rounded shadow-lg flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            <span>{successMessage}</span>
          </div>
        </div>
      )}
      <MailScannerDashboard
        userData={userData}
        userLetters={userLetters}
        userRequests={userRequests}
        onMakeRequest={handleMakeRequest}
      />
    </>
  );
}

const DashboardPage = () => {
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [userLetters, setUserLetters] = useState<Letter[]>([]);
  const [userRequests, setUserRequests] = useState<UserRequest[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DashboardPageInner
        user={user}
        setUser={setUser}
        userData={userData}
        setUserData={setUserData}
        userLetters={userLetters}
        setUserLetters={setUserLetters}
        userRequests={userRequests}
        setUserRequests={setUserRequests}
        successMessage={successMessage}
        setSuccessMessage={setSuccessMessage}
        loading={loading}
        setLoading={setLoading}
        error={error}
        setError={setError}
      />
    </Suspense>
  );
};

export default DashboardPage;