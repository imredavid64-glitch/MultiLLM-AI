"use client";

import { useState, useRef, ChangeEvent, FormEvent } from "react";
import { motion } from "framer-motion";
import { Save, Upload, User, Shield, CreditCard, Bell, Globe, Languages, Camera, Check, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { useAuth } from "@/components/auth/AuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import DashboardHeader from "@/components/layout/dashboard-header";

const avatarOptions = [
  { id: "1", name: "Alex", color: "bg-purple-400", emoji: "🧑‍💻" },
  { id: "2", name: "Sam", color: "bg-blue-400", emoji: "👨‍💼" },
  { id: "3", name: "Jordan", color: "bg-emerald-400", emoji: "👩‍🎨" },
  { id: "4", name: "Taylor", color: "bg-orange-400", emoji: "👨‍🔬" },
  { id: "5", name: "Casey", color: "bg-rose-400", emoji: "👩‍🚀" },
];

export default function SettingsPage() {
  const { user, refreshUser, updateProfile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user?.user_metadata?.name || user?.profile?.name || "");
  const [selectedAvatar, setSelectedAvatar] = useState(user?.user_metadata?.name?.split(" ")[0] || user?.profile?.name?.split(" ")[0] || "Alex");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState("");
  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState("UTC-8");
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    modelUpdates: true,
    billing: true,
  });
  const [saveStatus, setSaveStatus] = useState("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarSelect = (avatarName: string) => {
    setSelectedAvatar(avatarName);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        // In a real app, upload to cloud storage
        console.log("File uploaded:", reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaveStatus("saving");

    await new Promise((resolve) => setTimeout(resolve, 1000));

    try {
      await updateProfile({ name: displayName });
      setSaveStatus("saved");
      setIsEditing(false);
      await refreshUser();
    } catch {
      setSaveStatus("idle");
      toast.error("Failed to save settings");
      return;
    }

    setTimeout(() => {
      setSaveStatus("idle");
    }, 3000);
  };

  const handleCancel = () => {
    setDisplayName(user?.user_metadata?.name || user?.profile?.name || "");
    setEmail(user?.email || "");
    setPhone("");
    setLanguage("en");
    setTimezone("UTC-8");
    setTwoFactorEnabled(false);
    setNotifications({
      email: true,
      push: false,
      modelUpdates: true,
      billing: true,
    });
    setIsEditing(false);
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-slate-50">
        <DashboardHeader />

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-between mb-8"
          >
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Settings</h1>
              <p className="text-slate-600 mt-1">Manage your account preferences and integration settings</p>
            </div>
            {isEditing ? (
              <div className="flex gap-3">
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-colors flex items-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saveStatus === "saving"}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white rounded-xl font-semibold transition-colors flex items-center gap-2"
                >
                  {saveStatus === "saving" ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Edit Settings
              </button>
            )}
          </motion.div>

          <div className="space-y-8">
            {/* Profile Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8"
            >
              <h2 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-2">
                <User className="w-5 h-5 text-purple-600" />
                Profile
              </h2>
              <form className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2">
                    <label htmlFor="displayName" className="block text-sm font-medium text-slate-700 mb-1">
                      Display Name
                    </label>
                    <input
                      id="displayName"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      disabled={!isEditing}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-3">
                      Avatar
                    </label>
                    <div className="flex gap-2">
                      {avatarOptions.map((avatar) => (
                        <button
                          key={avatar.id}
                          onClick={() => handleAvatarSelect(avatar.name)}
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-semibold transition-all ${avatar.color} ${avatar.name === selectedAvatar ? "ring-2 ring-purple-600 ring-offset-2" : "hover:scale-110"}`}
                        >
                          {avatar.emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!isEditing}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-1">
                    Phone Number
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={!isEditing}
                    placeholder="+1 (555) 123-4567"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all disabled:bg-slate-50 disabled:text-slate-500"
                  />
                </div>

                <div className="relative">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!isEditing}
                    className="w-full px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl hover:border-purple-400 hover:bg-purple-50 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Upload className="w-5 h-5 text-slate-400" />
                    <span className="text-slate-600">Change Profile Picture</span>
                  </button>
                </div>
              </form>
            </motion.div>

            {/* Preferences Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8"
            >
              <h2 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-2">
                <Globe className="w-5 h-5 text-purple-600" />
                Preferences
              </h2>
              <form className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="language" className="block text-sm font-medium text-slate-700 mb-1">
                      Language
                    </label>
                    <select
                      id="language"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      disabled={!isEditing}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all disabled:bg-slate-50"
                    >
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                      <option value="de">German</option>
                      <option value="zh">Chinese</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="timezone" className="block text-sm font-medium text-slate-700 mb-1">
                      Timezone
                    </label>
                    <select
                      id="timezone"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      disabled={!isEditing}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all disabled:bg-slate-50"
                    >
                      <option value="UTC-8">Pacific Time (UTC-8)</option>
                      <option value="UTC-5">Eastern Time (UTC-5)</option>
                      <option value="UTC+0">UTC</option>
                      <option value="UTC+8">Beijing (UTC+8)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">
                    Notification Preferences
                  </label>
                  <div className="space-y-3">
                    {[
                      { key: "email", label: "Email notifications", default: true },
                      { key: "push", label: "Push notifications", default: false },
                      { key: "modelUpdates", label: "Model updates and news", default: true },
                      { key: "billing", label: "Billing and subscription alerts", default: true },
                    ].map((notification) => (
                      <label key={notification.key} className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={notifications[notification.key as keyof typeof notifications]}
                          onChange={(e) =>
                            setNotifications((prev) => ({
                              ...prev,
                              [notification.key]: e.target.checked,
                            }))
                          }
                          disabled={!isEditing}
                          className="w-5 h-5 rounded border-slate-300 text-purple-600 focus:ring-purple-500 focus:ring-2"
                        />
                        <span className="text-sm text-slate-700">{notification.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </form>
            </motion.div>

            {/* Security Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8"
            >
              <h2 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-2">
                <Shield className="w-5 h-5 text-purple-600" />
                Security
              </h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg">
                      <Shield className="w-4 h-4 text-slate-600" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">Two-Factor Authentication</div>
                      <div className="text-sm text-slate-500">Add an extra layer of security to your account</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setTwoFactorEnabled(!twoFactorEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                      twoFactorEnabled ? "bg-purple-600" : "bg-slate-200"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${twoFactorEnabled ? "translate-x-6" : "translate-x-1"}`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg">
                      <Bell className="w-4 h-4 text-slate-600" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">Session Timeout</div>
                      <div className="text-sm text-slate-500">Auto-logout after 30 minutes of inactivity</div>
                    </div>
                  </div>
                  <span className="text-sm text-purple-600 font-medium">15 min (recommended)</span>
                </div>

                <button
                  type="button"
                  className="w-full py-3 px-4 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 mt-4"
                  onClick={() => {
                    if (confirm("Are you sure? This will log you out from all devices and delete your data.")) {
                      toast.error("This action would be implemented with Appwrite account deletion");
                    }
                  }}
                >
                  Delete Account
                </button>
              </div>
            </motion.div>

            {/* Save Status */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="text-center"
            >
              {saveStatus === "saved" && (
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <Check className="w-4 h-4" />
                  <span className="text-sm font-medium">All changes saved successfully</span>
                </div>
              )}
            </motion.div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}