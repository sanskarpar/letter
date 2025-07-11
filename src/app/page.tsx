"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Scan, Forward, Shield, Clock, CreditCard, Users, CheckCircle, ArrowRight, Menu, X } from 'lucide-react';

export default function MailServiceLanding() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const router = useRouter();

  const subscriptionPlans = [
    {
      id: "monthly",
      name: "Monatlicher Plan",
      price: "12,99",
      originalPrice: null,
      savings: null,
      duration: "Monat",
      credits: 10,
      popular: false
    },
    {
      id: "semi-annual",
      name: "Halbjahresplan",
      price: "9,99",
      originalPrice: "12,99",
      savings: "23% sparen",
      duration: "6 Monate",
      credits: 10,
      popular: true
    },
    {
      id: "annual",
      name: "Jahresplan",
      price: "7,99",
      originalPrice: "12,99",
      savings: "38% sparen",
      duration: "12 Monate",
      credits: 10,
      popular: false
    }
  ];

  const creditPackages = [
    { credits: 5, price: 1 },
    { credits: 15, price: 2.5 },
    { credits: 35, price: 5 },
    { credits: 75, price: 10 }
  ];

  const features = [
    {
      icon: <Mail className="w-8 h-8 text-blue-500" />,
      title: "Sofortige Postbenachrichtigungen",
      description: "Sehen Sie Absendernamen und Datum sobald Ihre Post eintrifft - kein Rätselraten mehr."
    },
    {
      icon: <Scan className="w-8 h-8 text-purple-500" />,
      title: "Intelligentes Scansystem",
      description: "Erhalten Sie 5 kostenlose Scans pro Monat, dann nutzen Sie günstige Credits. Hochwertige digitale Kopien sofort geliefert."
    },
    {
      icon: <Forward className="w-8 h-8 text-green-500" />,
      title: "Nahtlose Weiterleitung",
      description: "Leiten Sie Ihre physische Post mit wenigen Klicks weltweit weiter. Wir erledigen den Rest."
    },
    {
      icon: <Shield className="w-8 h-8 text-red-500" />,
      title: "Sicher & Privat",
      description: "Ihre Post wird mit höchster Sicherheit und Vertraulichkeit behandelt. Ihr Datenschutz ist unsere Priorität."
    }
  ];

  const steps = [
    {
      number: "1",
      title: "Posteingang",
      description: "Ihre Post wird in unserer sicheren Einrichtung zugestellt",
      icon: "📬"
    },
    {
      number: "2",
      title: "Sofortige Benachrichtigung",
      description: "Sehen Sie Absender und Datum in Ihrem Dashboard",
      icon: "🔔"
    },
    {
      number: "3",
      title: "Aktion wählen",
      description: "Scannen (5 kostenlos monatlich) oder Post weiterleiten",
      icon: "⚡"
    },
    {
      number: "4",
      title: "Ergebnisse erhalten",
      description: "Digitale Scans ansehen oder Weiterleitung verfolgen",
      icon: "✨"
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
                Anmelden
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
              <a href="#features" className="block text-gray-700 hover:text-blue-600">Funktionen</a>
              <a href="#how-it-works" className="block text-gray-700 hover:text-blue-600">So funktioniert's</a>
              <a href="#pricing" className="block text-gray-700 hover:text-blue-600">Preise</a>
              <button
                className="w-full bg-blue-600 text-white py-2 rounded-full hover:bg-blue-700 transition-colors"
                onClick={() => router.push('/login')}
              >
                Anmelden
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
              Verpassen Sie nie wieder
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600"> Ihre Post</span>
              <br />
            </h1>
            <div className="relative z-10 bg-white/90 backdrop-blur-sm rounded-2xl p-8 shadow-lg max-w-4xl mx-auto">
              <p className="text-xl text-gray-800 mb-8 leading-relaxed font-medium">
                Erhalten Sie sofortige Benachrichtigungen bei Posteingang, scannen Sie Dokumente digital 
                und leiten Sie Pakete weltweit weiter. Ihre Postverwaltungslösung für die moderne Welt.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <button
                  className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-4 rounded-full text-lg font-semibold hover:shadow-lg transform hover:scale-105 transition-all duration-200"
                  onClick={() => router.push('/login')}
                >
                  Jetzt anmelden
                </button>
              </div>
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
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Leistungsstarke Funktionen</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Alles, was Sie brauchen, um Ihre Post effizient und sicher zu verwalten
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
            <h2 className="text-4xl font-bold text-gray-900 mb-4">So funktioniert's</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Einfacher, effizienter Prozess zur mühelosen Postverwaltung
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

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-6">
            Bereit, Ihr Post-Erlebnis zu verändern?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Schließen Sie sich Tausenden von Nutzern an, die nie wieder wichtige Post verpassen. Jetzt kostenlos starten.
          </p>
          <div className="flex justify-center">
            <button
              className="bg-white text-blue-600 px-8 py-4 rounded-full font-semibold hover:bg-gray-100 transition-colors"
              onClick={() => router.push('/login')}
            >
              Jetzt anmelden
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}