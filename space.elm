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
  , accelerating : Bool}
  
ship : Entity
ship = 
  { x = 0
  , y = 100
  , vx = 0
  , vy = 0
  , rot = 0 
  , accelerating = False}

newBomb : Random.Seed -> (Entity,Random.Seed)
newBomb seed = 
    let 
        (xpos,seed') = Random.generate (Random.int 0 screenWidth) seed
        (coinFlip,seed'') = (Random.generate (Random.int 0 1)) seed'
        (vxr,seed''') = (Random.generate (Random.float -0.1 0.1)) seed''
        (vyr,seed'''') = (Random.generate (Random.float -0.1 0.1)) seed'''
        bomb = 
        { x = toFloat xpos 
        , y = if coinFlip == 0 then 0 else screenHeight 
        , vx = vxr
        , vy = vyr
        , rot = 0
        , accelerating = False}
    in
       (bomb,seed'''')

physics dt s = 
    { s | 
        x <- s.x + dt * s.vx,
        y <- s.y + dt * s.vy
    }

gravity s =
    let
        d = distance 0 0 s.x s.y
        strength = 0.00003
    in
       { s |
            vx <- s.vx - (strength * (s.x)),
            vy <- s.vy - (strength * (s.y))}
       


distance x1 y1 x2 y2 = 
    let
        a = x2 - x1
        b = y2 - y1
    in
       abs (sqrt (a ^ 2 + b ^ 2))

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
    ([ ngon 3 10 |> filled red |> rotate (degrees 90) |> moveX 5 |> moveY -10
    , ngon 3 10 |> filled red |> rotate (degrees 90) |> moveX -5 |> moveY -10
    , ngon 3 6 |> filled red |> rotate (degrees 90) |> moveY 18
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
    |> gravity 

update (dt,keys,space) (s,bombs) = 
    let
        s' = s
        |> updateEntity dt
        |> moveEntity keys
        bombs' = List.map (updateEntity dt) bombs
    in
       (s',bombs')
    
view (s,bombs) = 
    let
        bombs' = List.map drawBomb bombs
    in 
       collage screenWidth screenHeight ([planet, drawPlayer s] ++ bombs')
        |> container screenWidth screenHeight middle 
        |> Graphics.Element.color black  

input = map3 (,,) (fps 30) Keyboard.arrows Keyboard.space 
bombs = (\t -> newBomb (Random.initialSeed (round t))) <~ every (3 * second)
   
main = 
    let
        (bomb,seed) = newBomb (Random.initialSeed 29283)
    in
        view <~ foldp update (ship,[bomb]) input
