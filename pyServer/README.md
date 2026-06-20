# PyServer

## Overview of the data pipeline

```
eeg_data_collector → signal-processing pipeline → API layer → WS
```

- eeg_data_collector: reads EEG from device or mock and streams data
- signal-processing pipeline: preprocessing and feature extraction
- API layer: exposes processed metrics to clients
- WS: real-time updates to the client app