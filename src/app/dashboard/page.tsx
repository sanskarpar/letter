"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc, collection, getDocs, query, orderBy, updateDoc } from "firebase/firestore";
import { app } from "@/firebase/config";
import { CreditCard, Calendar, User, Package, Shield, Mail, Eye, FileText, Download } from 'lucide-react';

type Mail = {
  id: string;
  title: string;
  fileUrl: string;
  fileName: string;
  uploadedAt: any;
  uploadedBy: string;
  status: "unread" | "read";
};

const MailScannerDashboard = ({ userData, userMails, onMarkAsRead }: { 
  userData: any; 
  userMails: Mail[];
  onMarkAsRead: (mailId: string) => Promise<void>;
}) => {
  const router = useRouter();
  const [selectedMail, setSelectedMail] = useState<Mail | null>(null);

  // Format the subscription end date
  const formatDate = (date: any) => {
    if (!date) return "N/A";
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString();
  };

  const handleViewMail = async (mail: Mail) => {
    setSelectedMail(mail);
    // Mark as read when viewing
    await onMarkAsRead(mail.id);
    console.log(`Marking mail ${mail.id} as read when viewing`);
  };

  // Updated handleDownloadMail to also mark as read
  const handleDownloadMail = async (mail: Mail) => {
    try {
      // Mark as read when downloading (before download starts)
      await onMarkAsRead(mail.id);
      console.log(`Marking mail ${mail.id} as read before download`);
      
      const response = await fetch(mail.fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = mail.fileName || `${mail.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading file:', error);
      // Still mark as read even if download fails
      await onMarkAsRead(mail.id);
      console.log(`Marking mail ${mail.id} as read after download error`);
      window.open(mail.fileUrl, '_blank');
    }
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
            <div className="flex gap-2">
              {userData?.role === 'admin' && (
                <button
                  onClick={() => router.push("/admin")}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg shadow-md hover:bg-purple-700 transition-colors"
                >
                  <Shield className="w-5 h-5 inline-block mr-1" />
                  Admin
                </button>
              )}
              <button className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-md hover:bg-blue-700 transition-colors">
                <User className="w-5 h-5 inline-block mr-1" />
                Account
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Plan Information Card */}
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
                      {formatDate(userData?.subscriptionEndDate)}
                    </p>
                  </div>
                )}
                <button className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors">
                  {userData?.planType === 'free' ? 'Upgrade Plan' : 'Manage Subscription'}
                </button>
              </div>
            </div>

            {/* Credits Information Card */}
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
                <button className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors">
                  Buy More Credits
                </button>
              </div>
            </div>

            {/* Mail Summary Card */}
            <div className="bg-orange-50 border border-orange-100 p-6 rounded-lg shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-800">Your Mail</h3>
                <Mail className="w-6 h-6 text-orange-600" />
              </div>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Mail:</span>
                  <span className="font-medium">{userMails.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Unread:</span>
                  <span className="font-medium text-red-600">
                    {userMails.filter(mail => mail.status === "unread").length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Read:</span>
                  <span className="font-medium text-green-600">
                    {userMails.filter(mail => mail.status === "read").length}
                  </span>
                </div>
              </div>
            </div>

            {/* Mail List */}
            <div className="lg:col-span-2 bg-gray-50 border border-gray-100 rounded-lg shadow-sm">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-xl font-semibold text-gray-800 flex items-center">
                  <Mail className="w-5 h-5 mr-2" />
                  Your Mail
                </h3>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {userMails.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    <Mail className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>No mail yet. Your mail will appear here once uploaded.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {userMails.map((mail) => (
                      <div key={mail.id} className="p-4 hover:bg-gray-100 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-gray-800">{mail.title}</h4>
                              {mail.status === "unread" && (
                                <span className="px-2 py-1 text-xs bg-red-100 text-red-800 rounded-full">
                                  New
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-500">
                              {formatDate(mail.uploadedAt)} • {mail.fileName}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleViewMail(mail)}
                              className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                              title="View PDF"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDownloadMail(mail)}
                              className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                              title="Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* PDF Viewer */}
            <div className="lg:col-span-1 bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                  <FileText className="w-5 h-5 mr-2" />
                  PDF Viewer
                </h3>
              </div>
              <div className="p-4">
                {selectedMail ? (
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-gray-800">{selectedMail.title}</h4>
                      <p className="text-sm text-gray-500">{selectedMail.fileName}</p>
                    </div>
                    <div className="border rounded-lg overflow-hidden" style={{ height: '400px' }}>
                      <iframe
                        src={selectedMail.fileUrl}
                        className="w-full h-full"
                        title={selectedMail.title}
                      />
                    </div>
                    <button
                      onClick={() => handleDownloadMail(selectedMail)}
                      className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download PDF
                    </button>
                  </div>
                ) : (
                  <div className="text-center text-gray-500 py-8">
                    <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>Select a mail to view the PDF</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(null);
  const [userMails, setUserMails] = useState<Mail[]>([]);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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

          // Fetch user's mail with better error handling
          const mailCollection = collection(db, "users", firebaseUser.uid, "mails");
          const mailQuery = query(mailCollection, orderBy("uploadedAt", "desc"));
          const mailSnapshot = await getDocs(mailQuery);
          
          const mails = mailSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Mail[];
          
          setUserMails(mails);
          setError(null);
        } catch (error: any) {
          console.error("Error fetching data:", error);
          setError(error.message);
          setUserMails([]);
        }
      }
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [router]);

  const handleMarkAsRead = async (mailId: string) => {
    if (!user) return;
    
    try {
      const db = getFirestore(app);
      const mailRef = doc(db, "users", user.uid, "mails", mailId);
      
      // Update Firestore document
      await updateDoc(mailRef, { status: "read" });
      console.log(`Mail ${mailId} marked as read in Firestore`);
      
      // Update local state immediately
      setUserMails(prev => {
        const updated = prev.map(mail => 
          mail.id === mailId ? { ...mail, status: "read" as const } : mail
        );
        console.log(`Local state updated for mail ${mailId}`);
        return updated;
      });
    } catch (error) {
      console.error("Error marking mail as read:", error);
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

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 mb-4">
            <Shield className="w-12 h-12 mx-auto mb-2" />
            <h3 className="text-lg font-semibold">Permission Error</h3>
            <p className="text-sm">Unable to access your mail data.</p>
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

  return <MailScannerDashboard userData={userData} userMails={userMails} onMarkAsRead={handleMarkAsRead} />;
}