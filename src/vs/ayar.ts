// VS sunucusu: Firebase projesinin web yapılandırması (Firebase konsolu → Proje ayarları → Web uygulaması).
// Bu değerler gizli değildir; her istemciye gönderilirler. Erişimi database.rules.json'daki kurallar sınırlar.
// null bırakılırsa VS kapalıdır (geliştirme sunucusunda aynı tarayıcının sekmeleri eşleşir).

export interface FirebaseAyar {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

export const FIREBASE_AYAR: FirebaseAyar | null = {
  apiKey: 'AIzaSyC3ZfqYx3-ZqlaJxlazjhklOo0f9gOm2Ew',
  authDomain: 'ydsproject-b3242.firebaseapp.com',
  databaseURL: 'https://ydsproject-b3242-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'ydsproject-b3242',
  storageBucket: 'ydsproject-b3242.firebasestorage.app',
  messagingSenderId: '695670548997',
  appId: '1:695670548997:web:2f5f7446fb4aada7230a6c',
};
