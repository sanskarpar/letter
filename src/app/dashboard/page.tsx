"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { app } from "@/firebase/config";
import { CreditCard, Calendar, User, Package, Shield } from 'lucide-react';

const MailScannerDashboard = ({ userData }: { userData: any }) => {
  const router = useRouter();

  // Format the subscription end date
  const formatDate = (date: any) => {
    if (!date) return "N/A";
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString();
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
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

            {/* Quick Actions */}
            <div className="md:col-span-2 bg-gray-50 border border-gray-100 p-6 rounded-lg shadow-sm">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button 
                  onClick={() => router.push("/billing")}
                  className="flex flex-col items-center justify-center p-4 bg-white rounded-lg shadow-sm hover:bg-gray-100 transition-colors"
                >
                  <CreditCard className="w-6 h-6 text-blue-600 mb-2" />
                  <span className="text-sm font-medium">Billing</span>
                </button>
                <button 
                  onClick={() => router.push("/schedule")}
                  className="flex flex-col items-center justify-center p-4 bg-white rounded-lg shadow-sm hover:bg-gray-100 transition-colors"
                >
                  <Calendar className="w-6 h-6 text-purple-600 mb-2" />
                  <span className="text-sm font-medium">Schedule</span>
                </button>
                <button 
                  onClick={() => router.push("/packages")}
                  className="flex flex-col items-center justify-center p-4 bg-white rounded-lg shadow-sm hover:bg-gray-100 transition-colors"
                >
                  <Package className="w-6 h-6 text-indigo-600 mb-2" />
                  <span className="text-sm font-medium">Packages</span>
                </button>
                <button 
                  onClick={() => router.push("/account")}
                  className="flex flex-col items-center justify-center p-4 bg-white rounded-lg shadow-sm hover:bg-gray-100 transition-colors"
                >
                  <User className="w-6 h-6 text-gray-600 mb-2" />
                  <span className="text-sm font-medium">Account</span>
                </button>
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
  const router = useRouter();

  useEffect(() => {
    const auth = getAuth(app);
    const db = getFirestore(app);
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.replace("/login");
      } else {
        setUser(firebaseUser);
        
        // Fetch user data from Firestore
        const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
        if (userDoc.exists()) {
          setUserData(userDoc.data());
        }
      }
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-lg text-gray-600">Loading...</span>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <MailScannerDashboard userData={userData} />;
}