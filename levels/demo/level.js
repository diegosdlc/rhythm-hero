window.RHYTHM_LEVELS = window.RHYTHM_LEVELS || {};
window.RHYTHM_LEVELS.demo = {
  schemaVersion: 1,
  id: 'demo',
  title: 'Demo Track',
  bpm: 120,
  offset: 0,
  noteMapping: {
    NOTE_1: 'A', NOTE_2: 'B', NOTE_3: 'C', NOTE_4: 'D', NOTE_5: 'E', NOTE_6: 'F', NOTE_7: 'G'
  },
  notes: [
    { id: 'n01', time: 26.875, note: 'NOTE_4', duration: 3.922, lyric: 'From the head of the monkey' },
    { id: 'n02', time: 30.847, note: 'NOTE_5', duration: 2.680, lyric: 'to the street of the shark' },
    { id: 'n03', time: 35.062, note: 'NOTE_5', duration: 4.101, lyric: 'taking hit after hit' },
    { id: 'n04', time: 39.213, note: 'NOTE_7', duration: 2.963, lyric: 'hold on' },
    { id: 'n05', time: 44.490, note: 'NOTE_4', duration: 3.077, lyric: 'keep it moving' },
    { id: 'n06', time: 47.617, note: 'NOTE_5', duration: 3.452, lyric: 'stay in time' },
    { id: 'n07', time: 51.909, note: 'NOTE_2', duration: 4.122, lyric: 'do not look away' },
    { id: 'n08', time: 56.081, note: 'NOTE_1', duration: 3.699, lyric: 'not yet' },
    { id: 'n09', time: 64.510, note: 'NOTE_2', duration: 0, lyric: 'one' },
    { id: 'n10', time: 64.752, note: 'NOTE_1', duration: 0, lyric: 'two' },
    { id: 'n11', time: 65.018, note: 'NOTE_2', duration: 0, lyric: 'three' },
    { id: 'n12', time: 65.527, note: 'NOTE_3', duration: 0.730, lyric: 'again' },
    { id: 'n13', time: 66.307, note: 'NOTE_4', duration: 1.517, lyric: 'keep going' },
    { id: 'n14', time: 68.694, note: 'NOTE_2', duration: 0, lyric: 'one' },
    { id: 'n15', time: 68.954, note: 'NOTE_1', duration: 0, lyric: 'two' },
    { id: 'n16', time: 69.194, note: 'NOTE_2', duration: 0, lyric: 'three' },
    { id: 'n17', time: 69.735, note: 'NOTE_3', duration: 0.740, lyric: 'again' },
    { id: 'n18', time: 70.525, note: 'NOTE_4', duration: 1.764, lyric: 'keep going' },
    { id: 'n19', time: 72.899, note: 'NOTE_2', duration: 0, lyric: 'one' },
    { id: 'n20', time: 73.152, note: 'NOTE_1', duration: 0, lyric: 'two' },
    { id: 'n21', time: 73.411, note: 'NOTE_2', duration: 0, lyric: 'three' },
    { id: 'n22', time: 73.947, note: 'NOTE_3', duration: 0.696, lyric: 'again' },
    { id: 'n23', time: 74.693, note: 'NOTE_4', duration: 1.442, lyric: 'keep going' },
    { id: 'n24', time: 77.118, note: 'NOTE_2', duration: 0, lyric: 'one' },
    { id: 'n25', time: 77.381, note: 'NOTE_1', duration: 0, lyric: 'two' },
    { id: 'n26', time: 77.617, note: 'NOTE_2', duration: 0, lyric: 'three' },
    { id: 'n27', time: 78.137, note: 'NOTE_3', duration: 0.774, lyric: 'again' },
    { id: 'n28', time: 78.961, note: 'NOTE_4', duration: 1.942, lyric: 'keep going' }
  ],
  events: [
    {
      id: 'thought_01', time: 33.0, type: 'thought', timeout: 7,
      title: 'THOUGHT', text: 'Did I lock the door?',
      options: [{ id: 'dismiss', label: 'Dismiss' }]
    },
    {
      id: 'phone_01', time: 49.0, type: 'phone_message', timeout: 11,
      title: 'MOM', text: 'Are you coming tonight?',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'later', label: 'Later' },
        { id: 'ignore', label: 'Ignore' }
      ]
    },
    {
      id: 'thought_02', time: 68.3, type: 'thought', timeout: 6,
      title: 'THOUGHT', text: 'You are falling behind.',
      options: [{ id: 'dismiss', label: 'Keep playing' }]
    }
  ]
};
