## What's new in 0.5.57

- **Interface — threads stay open:** opening a thread while the list was refreshing could throw you back to the list a few seconds later (often just as you opened a picture). A refresh that lands late no longer draws over the thread you've opened.
