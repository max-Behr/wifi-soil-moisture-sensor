/*
	Gies-o-mat ESP8266

	Describe what it does in layman's terms.  Refer to the components
	attached to the various pins.

	The circuit:
	* input: Gies-o-mat Humidity Sensor: https://www.ramser-elektro.at/shop/bausaetze-und-platinen/giesomat-kapazitiver-bodenfeuchtesensor-erdfeuchtesensor-mit-beschichtung/
	* list the components attached to each output

	Created 11 04 2020
	By Max Eric Behr

*/

#include <arduino.h>
#include "DataToMaker.h"
#include <LiquidCrystal_I2C.h>
#include <Wire.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <ESP8266mDNS.h>
#include <ArduinoOTA.h> // Biblothek für Over-the-air flashen

int pulseHigh; // Integer variable to capture High time of the incoming pulse

int pulseLow; // Integer variable to capture Low time of the incoming pulse

float pulseTotal; // Float variable to capture Total time of the incoming pulse

float frequency; // Calculated Frequency

HTTPClient http;

ESP8266WebServer server(80);

LiquidCrystal_I2C lcd(0x27, 16, 2); // LCD Stuff

const int sensorPin = 14; // Gies-o-mat sensor Signal ist mit Pin 14 (D5) des ESP8266 verbunden

const int sleepTimeInSeconds = 5 * 60; // Wie lange der ESP in Deep Sleep Mode gehen soll

const int giesWert = 10000; // Frquenz (Hz) ab wann eine Nachricht gesendet wird, dass es zu trocken ist!

const char* webservice = "http://192.168.2.76:3300/data";

// WIFI Stuff
const char* ssid = ""; // WLAN SSID
const char* password = ""; // WLAN Passwort
const char* dns_name = ""; // following for the name of: http://name_esp.local/ 

// IFTT Settings
const char* myKey = "";
const char* pflanzenName = "";
const String ifttTopic = "";

DataToMaker event(myKey, ifttTopic);

void setup() {

  pinMode(sensorPin, INPUT); // Sensor Pin als Eingang definieren
  
  // Debug console
  Serial.begin(115200);
  Serial.println("[Gies-o-mat]: ESP Gestartet");

  connectToWiFi();

  Serial.println("[Gies-o-mat]: Webserver gestartet.");
  ArduinoOTA.begin();

  ArduinoOTA.handle();
  
  wifiRetry(); // Checke ob WiFi-Verbindung vorliegt
  
  double frq = readFrq();

  postingDataToWebservice(frq);
  
  if(frq >= giesWert) {
    Serial.println("[Gies-o-mat]: Pflanze muss gegossen werden!");
    sendIFTTTMessage(frq);
  } else {
    Serial.println("[Gies-o-mat]: Pflanze muss nicht gegossen werden!")  ;
  }
  
  deepSleep();
}

void loop() {
  
  
}

// Liest die Frequenz des Gies-o-mat Sensors aus.
double readFrq() {

  Serial.println("[Gies-o-mat]: Beginne Bodenfeuchtigkeitmessung...");

  pulseHigh = pulseIn(sensorPin, HIGH);

  pulseLow = pulseIn(sensorPin, LOW);

  pulseTotal = pulseHigh + pulseLow; // Time period of the pulse in microseconds

  frequency =  1000000 / pulseTotal; // Frequency in Hertz (Hz)

  Serial.println("[Gies-o-mat]: " + String(frequency, 4)+ " Hz");

  return frequency;
  
}


// Versuche Wifi Connection wieder herzustellen
void wifiRetry() {

  int wifi_retry = 0; // Verbindungsversuche
  
  while(WiFi.status() != WL_CONNECTED && wifi_retry < 5 ) {
      wifi_retry++;
      Serial.println("WiFi not connected. Try to reconnect");
      WiFi.disconnect();
      WiFi.mode(WIFI_OFF);
      WiFi.mode(WIFI_STA);
      WiFi.begin(ssid, password);
      delay(100);
  }
  if(wifi_retry >= 5) {
      Serial.println("\nReboot");
      ESP.restart();
  }  
}

void connectToWiFi() {
  
  WiFi.setSleepMode(WIFI_NONE_SLEEP); // WiFi Modus auf None Sleep gesetzt
  WiFi.begin(ssid, password);

  Serial.print("[Gies-o-mat]: WLAN Verbindung wird hergestellt ...");
  
  while (WiFi.status() != WL_CONNECTED)
  {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  Serial.print("[Gies-o-mat]: Verbunden! IP-Adresse: ");
  Serial.println(WiFi.localIP());

  if (MDNS.begin(dns_name)) {
    Serial.println("[Gies-o-mat]: DNS gestartet, erreichbar unter: ");
    Serial.println("http://" + String(dns_name) + ".local/");
  }  
}

void deepSleep() {
  Serial.println();
  Serial.print("Geh für ");
  Serial.print(sleepTimeInSeconds);
  Serial.println(" sekunden in den Deep Sleep Modus. Gute Nacht!");

  ESP.deepSleep(sleepTimeInSeconds * 1000 * 1000);  
}

void postingDataToWebservice(double frq) {
  
  HTTPClient http;

  Serial.println();
  Serial.print("[Gies-o-mat]: Posting sensor data to collecting webservice ...");

  String payload = "f=" + String(frq, 0) + "&plantName=" + pflanzenName + "&id=" + WiFi.macAddress();

  http.begin(webservice);
  http.addHeader("Content-Type", "application/x-www-form-urlencoded");
  int httpCode = http.POST(payload);
  if (httpCode == HTTP_CODE_OK) {
     Serial.println(" done");
  } else {
     Serial.println(" failed");
  }
  http.end();  
}

void sendIFTTTMessage(double frq) {
  event.connect();
  event.setValue(1, pflanzenName);
  event.setValue(2, String(frq, 0));
  event.post();
}
