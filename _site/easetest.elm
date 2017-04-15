module Easetest where
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
import Easing exposing (..) 

type Action = Spin | Tick Time

type Sprite = Sprite 
    { shape : Form
    , rot : Float
    , animations : List (Maybe AnimationState)
    , x : Float
    , y : Float
    }

type AnimationType 
    = Rotation 
    | XPos 
    | YPos

type AnimationState = AnimationState 
    { previousTime : Time
    , elapsedTime : Time
    , startVal : Float
    , endVal : Float
    , animationType : AnimationType
    }

stepAnimation : Time -> Sprite -> Maybe AnimationState -> Sprite
stepAnimation t (Sprite s) animation =
    case animation of
        Nothing ->
            Sprite s
        Just (AnimationState anim) ->
           case anim.animationType of
                Rotation ->
                    Sprite { s | rot <- ease easeOutQuad float anim.startVal anim.endVal animLength anim.elapsedTime 
                    }
                XPos ->
                    Sprite { s | x <-  ease easeOutQuad float anim.startVal anim.endVal animLength anim.elapsedTime
                    }
                _ -> Sprite s



animLength = 1000
animAmount = 90

buttonImg = group
    [ rect 40 100 |> outlined (dashed red)
    , rect 35 95 |> filled blue
    , rect 100 2 |> filled red
    ]
button = Sprite
         { shape = buttonImg
         , rot = 0
         , x = 0
         , y = 0
         , animations = [Just (AnimationState 
                                 { previousTime = 0
                                 , elapsedTime = 0
                                 , startVal = 0
                                 , animationType = Rotation
                                 , endVal = animAmount
                                 })]
         }

update : Action -> Sprite -> Sprite
update action (Sprite sprite) =
    case action of
        Tick t ->
            let
                x = 1
            in    
                Sprite sprite--(List.foldr (stepAnimation t) sprite sprite.animations) 
        Spin ->
            Sprite sprite
            --case sprite.animationState of
            --    Nothing -> 
            --        { sprite | animationState <- 
            --            Just { previousTime = 0
            --                 , elapsedTime = 0
            --                 , startVal = sprite.x
            --                 , endVal = sprite.x + animAmount
            --                 , animationType = XPos} }
            --    Just s -> sprite

view : Sprite -> Element
view (Sprite s) = collage 1024 768 [s.shape 
                            |> rotate (degrees s.rot)
                            |> moveX s.x
                            |> moveY s.y
                         ]   

ticks = map Tick (fps 60)
keys = map (\_ -> Spin) Keyboard.space
streams = merge ticks keys

main = view <~ foldp update button streams
