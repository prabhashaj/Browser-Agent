/* eslint-disable */
// src/types/speech.d.ts

declare var SpeechRecognition: any;
declare var webkitSpeechRecognition: any;
declare type SpeechRecognitionEvent = any;
declare type SpeechRecognitionErrorEvent = any;

interface Window {
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}
