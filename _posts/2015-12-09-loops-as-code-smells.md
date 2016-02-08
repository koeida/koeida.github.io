People often complain about functional programming idioms being difficult to read.  Well, sure, they are, until you use them a lot.  Then they're easier.  At this point, I mentally recoil whenever I see a for loop.  I have to make a cup of tea, take a few deep breaths, and read slow. If, in a moment of weakness, I write one myself, it haunts me until I wake up in a sweat with a functional solution.

When I discover a solution, usually by searching through haskell blogs and libraries, I commit it to memory (using Anki), gradually building up a more and more expressive mental data-processing lexicon.

At this point, the only places I allow for loops are:

1. Code used purely for side-effects: blitting sprites to a screen, spitting debugging information to the console, etc.
2. Important, extremely slow code: Usually one or two small pieces of a substantial program will require being re-written imperatively.  That's totally fine. 

## The smells:

### "I want to change every element of a list"

    # Imperative
    l = [1,2,3]
    for x in range(len(l) - 1):
        # ten thousand lines of code
        l[x] = new_value
        
    # Functional
    map(some_function,[1,2,3])
    

    
    
        
    
        
        
