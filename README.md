# 🧠 Abalone Game 

A modern implementation of the **Abalone board game** built with JavaScript, featuring **AI opponent (Minimax + Alpha-Beta)** and **online multiplayer using PeerJS**.

---

## 🎮 Features

* ♟️ Classic Abalone gameplay
* 🤖 AI opponent using **Minimax algorithm**
* ⚡ Optimized with **Alpha-Beta pruning**
* 🌐 Online multiplayer (Create / Join Room)
* 🧑‍🤝‍🧑 Local multiplayer (same device)
* 🎨 Modern UI design

---

## 🧠 AI Logic

The AI uses:

* **Minimax Algorithm** → explores possible moves and chooses the best one
* **Alpha-Beta Pruning** → improves performance by skipping unnecessary branches
* **Heuristic Evaluation** → evaluates board based on:

  * Marble advantage
  * Position (center control)
  * Edge safety

---

## 🌐 Online Multiplayer

* Create a room and share the **Room ID**
* Another player joins using the same ID
* Built using **PeerJS (WebRTC)** for real-time connection

---

## 🚀 How to Run

### 🟢 Local (for development)

```bash
python -m http.server 8000
```

Then open:

```
http://localhost:8000
```

---

### 🌍 Deploy Online

You can deploy easily using:

* Netlify
* GitHub Pages

⚠️ Important: Both players must open the **same deployed link**

---

## 🕹️ How to Play

* Each player controls black or white marbles
* Take turns moving your marbles
* Push opponent marbles off the board
* First player to eject enough marbles wins

---

## 📁 Project Structure

```
📦 Abalone
 ┣ 📜 index.html
 ┣ 📜 style.css
 ┣ 📜 script.js
 ┗ 📜 ai_minimax.py
```

---

## 🛠️ Technologies Used

* HTML / CSS / JavaScript
* Python (via Pyodide)
* PeerJS (WebRTC)

---

## 💡 Future Improvements

* 🎯 Better AI difficulty levels
* 📱 Mobile optimization
* 🔊 Sound effects
* 🏆 Ranking system

---

## ⭐ Don't forget to star the repo!

If you like the project, give it a ⭐ on GitHub!
