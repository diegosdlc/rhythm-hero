/**
 * beatmap.js
 * Formato de nota: { time, y, duration }
 *   time     : segundos desde el inicio de la canción en que la nota debe ser alcanzada
 *   y        : posición vertical normalizada [0=top, 1=bottom]
 *   duration : duración en segundos (siempre > 0, todas son hold notes)
 *
 * Todas las notas son hold notes para facilitar el gameplay.
 * Este formato es fácilmente exportable/importable a Unity (JSON) o Unreal (DataTable).
 */

const DEMO_BEATMAP = {
  title:  "Demo Track",
  bpm:    120,
  offset: 0.5,
  notes: [
    { time: 26.875, y: 0.544, duration: 3.922 },
    { time: 30.847, y: 0.722, duration: 2.680 },
    { time: 35.062, y: 0.722, duration: 4.101 },
    { time: 39.213, y: 0.9, duration: 2.963 },
    { time: 44.490, y: 0.544, duration: 3.077 },
    { time: 47.617, y: 0.722, duration: 3.452 },
    { time: 51.909, y: 0.189, duration: 4.122 },
    { time: 56.081, y: 0.1, duration: 3.699 },
    { time: 64.510, y: 0.189, duration: 0.192 },
    { time: 64.752, y: 0.1, duration: 0.216 },
    { time: 65.018, y: 0.189, duration: 0.222 },
    { time: 65.527, y: 0.367, duration: 0.730 },
    { time: 66.307, y: 0.544, duration: 1.517 },
    { time: 68.694, y: 0.189, duration: 0.210 },
    { time: 68.954, y: 0.1, duration: 0.190 },
    { time: 69.194, y: 0.189, duration: 0.198 },
    { time: 69.735, y: 0.367, duration: 0.740 },
    { time: 70.525, y: 0.544, duration: 1.764 },
    { time: 72.899, y: 0.189, duration: 0.203 },
    { time: 73.152, y: 0.1, duration: 0.209 },
    { time: 73.411, y: 0.189, duration: 0.309 },
    { time: 73.947, y: 0.367, duration: 0.696 },
    { time: 74.693, y: 0.544, duration: 1.442 },
    { time: 77.118, y: 0.189, duration: 0.213 },
    { time: 77.381, y: 0.1, duration: 0.186 },
    { time: 77.617, y: 0.189, duration: 0.244 },
    { time: 78.137, y: 0.367, duration: 0.774 },
    { time: 78.961, y: 0.544, duration: 1.942 }
  ]
};
