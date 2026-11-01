// Firebase の設定（公開してよい値。安全は Firestore のルールで守る）
export const firebaseConfig = {
  apiKey: "AIzaSyBP9qVQ2d2HSGYbIOUSAfObRnmxhwGEpHc",
  authDomain: "english-drill-f6469.firebaseapp.com",
  projectId: "english-drill-f6469",
  storageBucket: "english-drill-f6469.firebasestorage.app",
  messagingSenderId: "149399882143",
  appId: "1:149399882143:web:1a91a46030f3fecd54d5aa",
};

// 管理者（教材を登録できる人）はコード（公開リポジトリ）に書かず、Firestore のルールだけで決める。
// アプリは「管理者だけが読める config/admin を読めるか」で管理者かどうかを判断する。

export const APP_VERSION = "0.3.3";
