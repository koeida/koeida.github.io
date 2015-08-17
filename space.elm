module Space where
import Graphics.Element exposing (..)
import Text exposing (..)
import Color exposing (..)
import Graphics.Collage exposing (..)
import Mouse
import List
import Debug
import Time exposing (..)
import Signal exposing (..)
import Keyboard
import Random

screenWidth = 800
screenHeight = 600

type alias Entity = 
  { x : Float
  , y : Float
  , vx : Float
  , vy : Float
  , rot : Float
  , accelerating : Bool
  , radius : Float}
  
playerShip : Entity
playerShip = 
  { x = 0
  , y = 200
  , vx = 0
  , vy = 0
  , rot = 0 
  , radius = 10
  , accelerating = False}

newBomb : Random.Seed -> Entity
newBomb seed = 
    let 
        (xpos,seed') = Random.generate (Random.int 0 screenWidth) seed
        (coinFlip,seed'') = (Random.generate (Random.int 0 1)) seed'
        (vxr,seed''') = (Random.generate (Random.float -0.1 0.1)) seed''
        (vyr,seed'''') = (Random.generate (Random.float -0.1 0.1)) seed'''
        bomb = 
        { x = toFloat xpos 
        , y = if coinFlip == 0 then -(screenHeight / 2) else (screenHeight / 2)
        , vx = vxr
        , vy = vyr
        , rot = 0
        , radius = 10
        , accelerating = False}
    in
       bomb

physics dt s = 
    { s | 
        x <- s.x + dt * s.vx,
        y <- s.y + dt * s.vy
    }

--opposite of filter
remove f l = List.filter (\x -> not (f x)) l

collisions es e =
    let 
        entities = remove (\e2 -> (round e.x) == (round e2.x) && (round e.y) == (round e2.y)) es  
        collisions = List.filter (\x -> collide e x) entities
    in 
       (List.length collisions) > 0

collide e1 e2 = (e1.radius + e2.radius) >= distanceEnt e1 e2 

gravity dt s =
    let
        strength = (0.0001) * dt   
        xdis = if s.x == 0 then 0.0000001 else s.x
        ydis = if s.y == 0 then 0.0000001 else s.y
        xmod = clamp -1 1 ((1/xdis) * 100)  
        ymod = clamp -1 1 ((1/ydis) * 100) 
    in
       { s |
            vx <- s.vx - (xmod * strength),
            vy <- s.vy - (ymod * strength)}
       

distanceEnt e1 e2 = 
    let
        a = abs ((e2.x + e2.radius) - (e1.x + e1.radius)) 
        b = abs ((e2.y + e2.radius) - (e1.y + e1.radius))
    in
       abs (sqrt ((a ^ 2) + (b ^ 2)))


rad = 57.296

moveEntity keys s =
    let
        accelerating = keys.y > 0
        radians = s.rot / rad
        accelMod = if accelerating then 0.01 else 0
    in
        { s |
            rot <- s.rot - (toFloat keys.x * 5), 
            accelerating <- accelerating,
            vx <- s.vx - (accelMod * (sin radians)),
            vy <- s.vy + (accelMod * (cos radians))}

shipGraphics withFlame = 
  let 
    fl = if withFlame then flame else [] 
  in group
    ([ ngon 3 10  |> filled red |> rotate (degrees 90) |> moveX 5  |> moveY -10
     , ngon 3 10  |> filled red |> rotate (degrees 90) |> moveX -5 |> moveY -10
     , ngon 3 6   |> filled red |> rotate (degrees 90) |> moveY 18
     , rect 10 30 |> filled darkGrey
     ] ++ fl)

bombGraphics = circle 10 |> filled darkGrey
  
flame = [ ngon 3 8 |> filled yellow |> rotate (degrees 30) |> moveY -18 ]

planet = circle 100 |> filled darkBlue

drawPlayer : Entity -> Form
drawPlayer s = (shipGraphics s.accelerating) |> moveX s.x  |> moveY s.y |> rotate (degrees s.rot)

drawBomb : Entity -> Form
drawBomb s = bombGraphics |> moveX s.x  |> moveY s.y

updateEntity dt e = 
    e
    |> physics dt
    |> gravity dt

view world = 
    let
        bombs' = List.map drawBomb world.bombs
    in 
       collage screenWidth screenHeight ([planet, drawPlayer world.player] ++ bombs')
        |> container screenWidth screenHeight middle 
        |> Graphics.Element.color black  

update : Event -> World -> World
update e w = case e of 
    Keys k -> 
        { w | player <- w.player |> moveEntity k  }
    NewEnemy i -> { w | bombs <- w.bombs ++ [newBomb (Random.initialSeed i)] } 
    NewFrame f -> 
        let
            bombs' = remove (collisions w.bombs) w.bombs
        in
           { w | player <- w.player |> updateEntity f
               , bombs <- List.map (updateEntity f) bombs'} 

type alias KeyInput = 
    { x : Int
    , y : Int
    , space: Bool }

type alias World =
    { player : Entity
    , bombs : List Entity}

type Event = Keys KeyInput | NewEnemy Int | NewFrame Float

bombAdder t bombs = bombs ++ [newBomb (Random.initialSeed (round t))]

keyinput : Signal Event
keyinput = 
    let 
        keySignal = map2 (\a s -> Keys {x = a.x, y = a.y, space = s}) Keyboard.arrows Keyboard.space
    in
        sampleOn (every <| 10 * millisecond) keySignal

frames = NewFrame <~ fps 30

enemies = map (\t -> NewEnemy (round t)) (every <| 0.5 * second)

events = mergeMany [ keyinput, frames, enemies ] 

initialWorld = {player = playerShip, bombs = []}
   
main = view <~ foldp update initialWorld events
