# Архитектура «Пиксельных гонок» — как есть сейчас

Это схема реальной игры, а не «идеальной архитектуры». Сплошная стрелка — вызывает / запускает,
пунктир — читает данные или настройки.

```mermaid
flowchart TD
  main["main.ts"] --> config["config.ts<br/>создаёт Phaser.Game"]
  config --> Shop["ShopScene<br/>гараж"]
  config --> Game["GameScene<br/>гонка"]

  Input["Клавиатура<br/>↑↓←→ / WASD, Space, P, R, M, Enter"] --> Shop
  Input --> Game

  Shop -- "выбор машины:<br/>registry + localStorage,<br/>старт NEW_RUN" --> Game
  Game -- "M — в гараж" --> Shop
  Game -- "goToLevel(): scene.restart(RunData)<br/>следующий уровень / повтор / новая игра" --> Game

  Cars["cars.ts<br/>CARS: машины игрока"] -.-> Shop
  Cars -.-> Game
  Pixel["pixelArt.ts<br/>текстуры дороги, конуса,<br/>машин соперников"] -.-> Shop
  Pixel -.-> Game

  subgraph GS["GameScene: update() каждый кадр"]
    State["Состояние гонки<br/>state: tutorial → countdown → racing ⇄ paused<br/>→ crashed / finished<br/>speed, distance, lives, таймеры"]
    Move["Движение игрока<br/>updateSpeed, steer"]
    World["Мир<br/>scrollWorld: дорога и препятствия едут вниз"]
    Spawn["Появление препятствий<br/>spawnObstacles: конусы, попутные и встречные"]
    Works["Дорожные работы<br/>spawnRoadworks, isLaneClosed"]
    Hit["Столкновения<br/>checkCollisions, knockAway"]
    Phase["Фазы<br/>checkPhase → enterPhase2"]
    Finish["Финиш и результат<br/>checkFinish, finishLevel, crashOut"]
    UI["Интерфейс<br/>HUD, полоса прогресса, баннер ФАЗА 2,<br/>пауза, подсказка уровня"]
  end

  Game --> State
  State --> Move --> World --> Spawn --> Works --> Hit --> Phase --> Finish --> UI
  Hit -- "−жизнь, скорость, неуязвимость" --> State
  Phase -- "rules = withPhase2(level)" --> Spawn
  Finish -- "state, рекорд, общее время" --> State

  Levels["levels.ts<br/>LEVELS: длина, трафик, тема трассы,<br/>roadworks, phase2, tutorial;<br/>withPhase2()"] -.-> State
  Levels -.-> Phase
  RW["roadworks.ts<br/>спрайты, анимации,<br/>раскладка участка"] -.-> Works
  Conf["gameConfig.ts<br/>GAME_CONFIG: управление, нитро,<br/>жизни, препятствия, фаза 2, дорожные работы"] -.-> Move
  Conf -.-> Spawn
  Conf -.-> Hit
  Conf -.-> Phase
  Conf -.-> Works
```

## Кто чьё состояние меняет

| Часть | Что меняет |
|---|---|
| `ShopScene` | выбранную машину (`registry`, `localStorage`), запускает `GameScene` |
| `updateSpeed` / `steer` | `speed`, нитро-таймеры, позицию машины игрока |
| `scrollWorld` | `distance`, позиции дороги, препятствий и финиша; удаляет уехавшее за экран |
| `spawnObstacles` / `spawnRoadworks` | список `obstacles`, перекрытую полосу (`closedLane`) |
| `checkCollisions` | `lives`, `speed`, неуязвимость; при 0 жизней — `state = crashed` |
| `checkPhase` | `phase`, действующие правила `rules`, цвет трассы |
| `checkFinish` / `finishLevel` | `state = finished`, рекорд уровня, общее время забега |
| пауза (`P`) | `state = paused`, сдвигает таймеры на длину паузы |
| `goToLevel` | перезапускает сцену с `RunData` (номер уровня, общее время) |

## Где искать числа

- **Баланс** (скорость, нитро, жизни, доли препятствий, фаза 2, дорожные работы) — `GAME_CONFIG` в `src/game/gameConfig.ts`.
- **Уровни** (длина, трафик, тема трассы, есть ли фаза 2 и дорожные работы, подсказка) — `LEVELS` в `src/game/levels.ts`.
- **Машины игрока** — `CARS` в `src/game/cars.ts`.
