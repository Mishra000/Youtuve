import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { useState, createContext, useEffect, useContext, useRef } from "react";
import { provider, auth } from "./firebase";
import axiosInstance from "./axiosinstance";

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [pendingOtp, setPendingOtp] = useState(null);
  const interactiveLoginInProgress = useRef(false);
  const autoLoginAttemptedUid = useRef(null);

  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error("Failed to parse stored user", e);
      }
    }
  }, []);

  const login = (userdata, themeData = null) => {
    setUser(userdata);
    localStorage.setItem("user", JSON.stringify(userdata));

    if (themeData) {
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("yourtube:theme-change", { detail: themeData })
        );
      }
    }
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem("user");
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error during sign out:", error);
    }
  };

  const executeBackendLogin = async (payload) => {
    const deviceId =
      typeof window !== "undefined"
        ? localStorage.getItem("yt_device_id")
        : null;

    let response;
    try {
      response = await axiosInstance.post("/auth/login", {
        ...payload,
        deviceIdentifier: deviceId || undefined,
      });
    } catch (error) {
      return {
        success: false,
        message:
          error?.response?.data?.message ||
          "Sign-in failed. Please try again.",
      };
    }

    if (response.data.otpRequired) {
      setPendingOtp(response.data);
      return { success: true, otpRequired: true, data: response.data };
    }

    if (response.data.deviceIdentifier) {
      localStorage.setItem("yt_device_id", response.data.deviceIdentifier);
    }

    login(response.data.result, response.data.theme);
    return { success: true, otpRequired: false, data: response.data };
  };

  const handlegooglesignin = async () => {
    interactiveLoginInProgress.current = true;
    try {
      const result = await signInWithPopup(auth, provider);
      const firebaseuser = result.user;
      autoLoginAttemptedUid.current = firebaseuser.uid;
      const payload = {
        email: firebaseuser.email,
        name: firebaseuser.displayName,
        image: firebaseuser.photoURL || "https://github.com/shadcn.png",
      };
      return await executeBackendLogin(payload);
    } catch (error) {
      return {
        success: false,
        message:
          error?.code === "auth/popup-closed-by-user"
            ? "Google sign-in was cancelled."
            : "Google sign-in failed. Please try again.",
      };
    } finally {
      interactiveLoginInProgress.current = false;
    }
  };

  const verifyLoginOtp = async ({ tempToken, otp, trustDevice = true, deviceName }) => {
    try {
      const res = await axiosInstance.post("/auth/verify-login-otp", {
        tempToken,
        otp,
        trustDevice,
        deviceName,
      });

      if (res.data.success) {
        if (res.data.deviceIdentifier) {
          localStorage.setItem("yt_device_id", res.data.deviceIdentifier);
        }
        login(res.data.result, res.data.theme);
        setPendingOtp(null);
        return { success: true, message: res.data.message };
      }
      return { success: false, message: res.data.message || "Verification failed." };
    } catch (err) {
      const msg = err?.response?.data?.message || "Invalid verification code.";
      return { success: false, message: msg };
    }
  };

  const resendLoginOtp = async (tempToken) => {
    try {
      const res = await axiosInstance.post("/auth/resend-login-otp", { tempToken });
      return { success: true, message: res.data.message };
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to resend code.";
      return { success: false, message: msg };
    }
  };

  const cancelOtpLogin = () => {
    setPendingOtp(null);
  };

  useEffect(() => {
    const unsubcribe = onAuthStateChanged(auth, async (firebaseuser) => {
      // Only auto-login if no active user and no active OTP challenge
      const savedUser = localStorage.getItem("user");
      if (
        firebaseuser &&
        !savedUser &&
        !interactiveLoginInProgress.current &&
        autoLoginAttemptedUid.current !== firebaseuser.uid
      ) {
        autoLoginAttemptedUid.current = firebaseuser.uid;
        try {
          const payload = {
            email: firebaseuser.email,
            name: firebaseuser.displayName,
            image: firebaseuser.photoURL || "https://github.com/shadcn.png",
          };
          const result = await executeBackendLogin(payload);
          if (!result.success) {
            console.warn("Automatic sign-in failed:", result.message);
          }
        } catch (error) {
          console.warn("Automatic sign-in failed:", error?.message || error);
        }
      }
    });
    return () => unsubcribe();
  }, []);

  return (
    <UserContext.Provider
      value={{
        user,
        login,
        logout,
        handlegooglesignin,
        pendingOtp,
        verifyLoginOtp,
        resendLoginOtp,
        cancelOtpLogin,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
