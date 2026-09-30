#include <WiFi.h>
#include <HTTPClient.h>

const char* ssid="POCO C3";
const char* password="789789788";
const char* SERVER="http://192.168.43.229:5000";

struct Device{
  uint8_t pin;
  const char* deviceId;
  const char* token;
  bool lastState;
};

Device devices[]={
  {15,"DEV-DE9E2FEE","b2b5acb7bbf80e2f8e4f9fb71f28fb255e8c367133adfbfc",HIGH},
  {2,"DEV-49E52E3F","c032d7c3ae481513510695a882cb25a89d7d10b7d1a39a64",HIGH}
};

const int COUNT=sizeof(devices)/sizeof(devices[0]);
unsigned long lastBeat=0;
const unsigned long BEAT_MS=30000;

void postJson(const char* ep,String body){
  HTTPClient http;
  String url=String(SERVER)+ep;
  http.begin(url);
  http.addHeader("Content-Type","application/json");
  Serial.println("\nPOST "+url);
  Serial.println(body);
  int code=http.POST(body);
  Serial.print("HTTP:");
  Serial.println(code);
  if(code>0) Serial.println(http.getString());
  else Serial.println(http.errorToString(code));
  http.end();
}

String authBody(Device &d){
  return "{\"deviceId\":\""+String(d.deviceId)+"\",\"deviceToken\":\""+String(d.token)+"\"}";
}

void heartbeat(Device &d){
  postJson("/api/v1/esp/heartbeat",authBody(d));
}
void reconnect(Device &d){
  postJson("/api/v1/esp/reconnect",authBody(d));
}
void status(Device &d){
  String b=authBody(d);
  b.remove(b.length()-1);
  b+=",\"sensorHealth\":\"OK\",\"firmwareVersion\":\"1.0.0\"}";
  postJson("/api/v1/esp/device-status",b);
}
void update(Device &d,bool present){
  String st=present?"vehicle_present":"vehicle_absent";
  String b="{\"deviceId\":\""+String(d.deviceId)+"\",\"deviceToken\":\""+String(d.token)+"\",\"sensor\":\"IR\",\"status\":\""+st+"\"}";
  postJson("/api/v1/esp/update-slot",b);

  String s="{\"deviceId\":\""+String(d.deviceId)+"\",\"deviceToken\":\""+String(d.token)+"\",\"sensorType\":\"IR\",\"rawValue\":"+String(present?1:0)+",\"processedStatus\":\""+st+"\"}";
  postJson("/api/v1/esp/sensor-update",s);
}

void connectWifi(){
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid,password);
  Serial.print("Connecting");
  while(WiFi.status()!=WL_CONNECTED){
    delay(500);Serial.print(".");
  }
  Serial.println("\nConnected");
  Serial.print("IP: ");Serial.println(WiFi.localIP());
  for(int i=0;i<COUNT;i++){
    reconnect(devices[i]);
    heartbeat(devices[i]);
    status(devices[i]);
  }
}

void setup(){
  Serial.begin(115200);
  for(int i=0;i<COUNT;i++) pinMode(devices[i].pin,INPUT_PULLUP);
  connectWifi();
}

void loop(){
  if(WiFi.status()!=WL_CONNECTED) connectWifi();

  for(int i=0;i<COUNT;i++){
    bool s=digitalRead(devices[i].pin);
    if(s!=devices[i].lastState){
      devices[i].lastState=s;
      Serial.print("GPIO ");
      Serial.print(devices[i].pin);
      Serial.println(s==LOW?" Vehicle Present":" Vehicle Absent");
      update(devices[i],s==LOW);
    }
  }

  if(millis()-lastBeat>BEAT_MS){
    lastBeat=millis();
    for(int i=0;i<COUNT;i++){
      heartbeat(devices[i]);
      status(devices[i]);
    }
  }
  delay(100);
}
