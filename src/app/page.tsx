"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Scan, Forward, Shield, Clock, CreditCard, Users, CheckCircle, ArrowRight, Menu, X } from 'lucide-react';

export default function MailServiceLanding() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const router = useRouter();

  const features = [
    {
      icon: <Mail className="w-8 h-8 text-blue-500" />,
      title: "Instant Mail Notifications",
      description: "See sender names and dates as soon as your mail arrives - no more wondering what's waiting for you."
    },
    {
      icon: <Scan className="w-8 h-8 text-purple-500" />,
      title: "Smart Scanning System",
      description: "Get 5 free scans monthly, then use affordable credits. High-quality digital copies delivered instantly."
    },
    {
      icon: <Forward className="w-8 h-8 text-green-500" />,
      title: "Seamless Forwarding",
      description: "Forward your physical mail anywhere in the world with just a few clicks. We handle the rest."
    },
    {
      icon: <Shield className="w-8 h-8 text-red-500" />,
      title: "Secure & Private",
      description: "Your mail is handled with the utmost security and confidentiality. Your privacy is our priority."
    }
  ];

  const steps = [
    {
      number: "1",
      title: "Mail Arrives",
      description: "Your mail is delivered to our secure facility",
      icon: "📬"
    },
    {
      number: "2",
      title: "Instant Notification",
      description: "See sender name and date in your dashboard",
      icon: "🔔"
    },
    {
      number: "3",
      title: "Choose Action",
      description: "Scan (5 free monthly) or forward your mail",
      icon: "⚡"
    },
    {
      number: "4",
      title: "Get Results",
      description: "View digital scans or track forwarded mail",
      icon: "✨"
    }
  ];

  const pricing = [
    {
      name: "Starter",
      price: "€9.99",
      period: "/month",
      features: [
        "5 free scans monthly",
        "Unlimited incoming mail notifications",
        "Sender name visibility on all mail",
        "Basic mail forwarding (pay-per-use)",
        "Email support",
        "Scan history (30 days)",
        "Secure document storage",
        "Downloadable scanned PDFs"
      ],
      popular: false
    }

  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-2">
              <Mail className="w-8 h-8 text-blue-600" />
              <span className="text-xl font-bold text-gray-900">MailFlow</span>
            </div>
            
            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              <button
                className="bg-blue-600 text-white px-6 py-2 rounded-full hover:bg-blue-700 transition-colors"
                onClick={() => router.push('/login')}
              >
                Login
              </button>
            </div>

            {/* Mobile menu button */}
            <button 
              className="md:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Mobile Navigation */}
          {isMenuOpen && (
            <div className="md:hidden py-4 space-y-4">
              <a href="#features" className="block text-gray-700 hover:text-blue-600">Features</a>
              <a href="#how-it-works" className="block text-gray-700 hover:text-blue-600">How It Works</a>
              <a href="#pricing" className="block text-gray-700 hover:text-blue-600">Pricing</a>
              <button
                className="w-full bg-blue-600 text-white py-2 rounded-full hover:bg-blue-700 transition-colors"
                onClick={() => router.push('/login')}
              >
                Login
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-6 leading-tight">
              Never Miss Your
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600"> Mail</span>
              <br />Again
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
              Get instant notifications when mail arrives, scan documents digitally, and forward packages anywhere. 
              Your mail management solution for the modern world.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button
                className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-4 rounded-full text-lg font-semibold hover:shadow-lg transform hover:scale-105 transition-all duration-200"
                onClick={() => router.push('/login')}
              >
                Start Free Trial
              </button>
            </div>
          </div>
        </div>
        
        {/* Animated background elements */}
        <div className="absolute top-20 left-10 w-20 h-20 bg-blue-200 rounded-full opacity-20 animate-pulse"></div>
        <div className="absolute bottom-20 right-10 w-32 h-32 bg-purple-200 rounded-full opacity-20 animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/4 w-16 h-16 bg-indigo-200 rounded-full opacity-20 animate-pulse delay-500"></div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Powerful Features</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Everything you need to manage your mail efficiently and securely
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="bg-gradient-to-br from-gray-50 to-gray-100 p-8 rounded-2xl hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2">
                <div className="mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 px-4 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">How It Works</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Simple, streamlined process to manage your mail effortlessly
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="text-center">
                <div className="bg-white rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6 shadow-lg">
                  <span className="text-3xl">{step.icon}</span>
                </div>
                <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center mx-auto mb-4 text-sm font-bold">
                  {step.number}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{step.title}</h3>
                <p className="text-gray-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Simple Pricing</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Start with 5 free scans every month.
            </p>
          </div>
          
          <div className="grid md:grid-cols-1 gap-8 max-w-md mx-auto">
            {pricing.map((plan, index) => (
              <div key={index} className={`relative p-8 rounded-2xl border-2 ${plan.popular ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'} hover:shadow-xl transition-all duration-300`}>
                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  <div className="flex items-center justify-center">
                    <span className="text-4xl font-bold text-gray-900">{plan.price}</span>
                    <span className="text-gray-600 ml-2">{plan.period}</span>
                  </div>
                </div>
                
                <ul className="space-y-4 mb-8">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center">
                      <CheckCircle className="w-5 h-5 text-green-500 mr-3" />
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                <button
                  className={`w-full py-3 rounded-full font-semibold transition-colors ${plan.popular ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}`}
                  onClick={() => router.push('/login')}
                >
                  Get Started
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-6">
            Ready to Transform Your Mail Experience?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Join thousands of users who never miss important mail again. Start your free trial today.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              className="bg-white text-blue-600 px-8 py-4 rounded-full font-semibold hover:bg-gray-100 transition-colors"
              onClick={() => router.push('/login')}
            >
              Start Free Trial
            </button>
            <button
              className="border-2 border-white text-white px-8 py-4 rounded-full font-semibold hover:bg-white hover:text-blue-600 transition-colors"
              onClick={() => router.push('/login')}
            >
              Contact Sales
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <Mail className="w-8 h-8 text-blue-400" />
                <span className="text-xl font-bold">MailFlow</span>
              </div>
              <p className="text-gray-400">
                The modern solution for mail management. Secure, efficient, and reliable.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Pricing</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Support</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Contact Us</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Status</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Terms</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2025 MailFlow. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}