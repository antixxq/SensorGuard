#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include "config.h"

DHT dht(DHT_PIN, DHT11);
unsigned long lastSample = 0;
unsigned long lastReconnect = 0;
constexpr unsigned long SAMPLE_INTERVAL_MS = 5000;
constexpr unsigned long RECONNECT_INTERVAL_MS = 10000;

void setup() {
  Serial.begin(115200);
  dht.begin();
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.println("SensorGuard starting. Connecting to Wi-Fi...");
}

void loop() {
  const unsigned long now = millis();
  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastReconnect >= RECONNECT_INTERVAL_MS) {
      lastReconnect = now;
      Serial.println("Wi-Fi unavailable; reconnecting.");
      WiFi.reconnect();
    }
    delay(20);
    return;
  }
  if (now - lastSample < SAMPLE_INTERVAL_MS) {
    delay(20);
    return;
  }
  lastSample = now;
  const float humidity = dht.readHumidity();
  const float temperature = dht.readTemperature();
  if (isnan(humidity) || isnan(temperature) || humidity < 0 || humidity > 100 || temperature < -40 || temperature > 80) {
    Serial.println("DHT11 reading failed. Check wiring; no measurement sent.");
    return;
  }

  WiFiClient transport;
  HTTPClient http;
  http.setConnectTimeout(2000);
  http.setTimeout(2000);
  if (!http.begin(transport, SERVER_URL)) {
    Serial.println("Unable to initialize HTTP request. Check SERVER_URL.");
    return;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  const String body = "{\"temperature\":" + String(temperature, 2) + ",\"humidity\":" + String(humidity, 2) + "}";
  const int status = http.POST(body);
  if (status == 201) {
    Serial.printf("Reading accepted: %.1f C, %.1f %% RH\n", temperature, humidity);
  } else if (status > 0) {
    Serial.printf("Server rejected reading (HTTP %d). Check key, mode, and values.\n", status);
  } else {
    Serial.printf("Network error: %s. Will retry with the next reading.\n", HTTPClient::errorToString(status).c_str());
  }
  http.end();
}
