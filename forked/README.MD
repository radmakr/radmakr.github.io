# Forked 
**By: Thomas Rademaker**

### Summary: Include screen shots or a video of your app highlighting its features

I have a splash screen that stays up for 2 seconds to simulate some startup logic.. just for fun.  
![Splash screen](../screenshots/splash.jpeg)  

A list of the recipes when the good endpoint is hit. This is actually displaying the contents of SwiftData.  
![Recipe List](../screenshots/list.jpeg)   

A menu with the ability to sort by name or cuisine.  
![Sort Menu](../screenshots/sortBy.jpeg)  

The list when sorted by cuisine. Notice it is now in named sections.
![Sorted by Cuisine List](../screenshots/cuisine.jpeg)  

An alert before deleting the list.  
![Delete alert](../screenshots/alert.jpeg)  

The view when empty.  
![Empty list](../screenshots/noRecipes.jpeg)  

Finally, sort by which endpoint.  
![Endpoint Menu](../screenshots/sortByEndpoint.jpeg)  


### Focus Areas: What specific areas of the project did you prioritize? Why did you choose to focus on these areas?

1. Everything works in the SwiftUI canvas. If you are going to use the new tools, use them properly. Half the benefit of SwiftUI is the canvas previews. 
2. It works online and offline (after caching data). Always having access to data is important for UX.
3. I spent time architecting a solution that is production ready and is ready to be expanded upon. I know this is a simple app, but as soon as the requirements expand, this codebase is ready to grow. Often in my career I’ve been asked to prototype a solution. Guess what? That solution almost always made it into production. I learned to always code as if a prototype will become the final product. 

### Time Spent: Approximately how long did you spend working on this project? How did you allocate your time?
It’s hard to know exactly, if you see the times on the git commits you’ll see I worked on this at various points over the weekend.  
Best guess, about 3 hours. Not including the 11 years I spent perfecting my craft :-)

### Trade-offs and Decisions: Did you make any significant trade-offs in your approach?
There are a few // TODO: comments where I would idealy like to handle errors better.  
Typically this enum in the networking package would be internal and the title property would not exist,

```swift
public enum RecipeAPI {
    case all
    case malformed
    case empty
    
    public var title: String {
        switch self {
        case .all: "all"
        case .malformed: "malformed"
        case .empty: "empty"
        }
    }
}
```

I did this to simplify the endpoint menu selector,

```swift
Menu("API Endpoint") {
   Picker("API", selection: $apiEndpoint) {
      Text("all")
        .tag(RecipeAPI.all)
      Text("malformed")
        .tag(RecipeAPI.malformed)
      Text("empty")
        .tag(RecipeAPI.empty)
   }
}
```

### Weakest Part of the Project: What do you think is the weakest part of your project?
The UI is pretty basic and boring. I would ideally work with a professional UI/UX designer and build a beautiful app.  
Weakest code is the photo caching. It works and it works well, but if I had more time this would have been its own swift package and tested and reviewed for performance.  
I could probably have more tests everywhere as well. 

### Additional Information: Is there anything else we should know? Feel free to share any insights or constraints you encountered.
You specifically stated
> your app should disregard the entire list of recipes and handle the error gracefully 

But I didn’t do that. I customized the JSON decoding to not include malformed recipes while including recipes that were formed properly.

**Architecture:** This sometimes is not something that a lot of iOS devs agree with but SwiftUI *is* the architecture. I leaned heavily into using SwiftUI and the environment. I am an easy going dev and can adjust to any codebase / architecture, but if I was asked to design a system from scratch today, this is how I would do it. 
I guess I would call what I did here SwiftUI MVP, where MVP stands for model, view, presenter. I like to split my views into views (what is seen on the display) and presenters (which handle presentation, sheets, alerts, navigation, etc.).  
For the model I used Swift Data which would not work in the fetch app today because your deployment target is too low.   
I moved storage (interacting with folders) and networking to their own Swift packages. They are included in the same repo as the project (for simplicity), but ideally they would be separate git repos and pulled into the app. Having them separate allows them to be used in other projects. Pulling code into packages and removing them from the app target helps with code structure, organization, and most importantly compile times. Although, with the latest Xcode using folders instead of groups, compilation is faster thanks to the work Xcode devs did behind the scenes.

















	