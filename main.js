import './style.css';

// Import the necessary Firebase functions
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore'; 

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCytcll_PrQsBm_D4DaAR9lTFUgfdXlNaI",
  authDomain: "project-snac.firebaseapp.com",
  projectId: "project-snac",
  storageBucket: "project-snac.appspot.com",
  messagingSenderId: "313245671786",
  appId: "1:313245671786:web:bda0319f141f667cbf8513",
  measurementId: "G-NM7WEVJV92"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app); 

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// Function to set up media sources
async function setupMedia() {
  try {
    // Request video and audio permission from the user
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    remoteStream = new MediaStream();

    // Add local stream tracks to peer connection
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    // When a remote stream is received, add it to the remote stream
    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        remoteStream.addTrack(track);
      });
    };

    // Set the local and remote video sources
    webcamVideo.srcObject = localStream;
    remoteVideo.srcObject = remoteStream;

    // Enable the call and answer buttons, disable the webcam button
    callButton.disabled = false;
    answerButton.disabled = false;
    webcamButton.disabled = true;
  } catch (error) {
    console.error('Error accessing media devices:', error);
    alert('Error accessing camera or microphone: ' + error.message);
  }
}

// Setup media sources when webcam button is clicked
webcamButton.onclick = setupMedia;

// Create a call
callButton.onclick = async () => {
  // Reference Firestore collections for signaling
  const callDoc = firestore.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  // Set the call ID in the input field
  callInput.value = callDoc.id;

  // Get ICE candidates for caller, save them to Firestore
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      offerCandidates.add(event.candidate.toJSON());
    }
  };

  // Create an offer and set the local description
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  // Store the offer in Firestore
  await callDoc.set({ offer });

  // Listen for a remote answer from Firestore
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // Add remote ICE candidates to peer connection
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
};

// Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');

  // Get ICE candidates for answerer, save them to Firestore
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      answerCandidates.add(event.candidate.toJSON());
    }
  };

  // Get the call data from Firestore
  const callData = (await callDoc.get()).data();

  // Set the remote description with the offer
  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  // Create an answer and set the local description
  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  // Update the Firestore document with the answer
  await callDoc.update({ answer });

  // Add remote ICE candidates to the peer connection
  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });
};

// Optional: Add functionality to hang up a call
hangupButton.onclick = () => {
  pc.close();
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }
  webcamButton.disabled = false;
  callButton.disabled = true;
  answerButton.disabled = true;
  hangupButton.disabled = true;
};
